import request = require('supertest');
import { PrismaClient } from '@prisma/client';

const baseUrl = process.env.INTEGRATION_BASE_URL ?? 'http://localhost:3000';
const suffix = `${Date.now()}-${process.pid}`;
const prisma = new PrismaClient({
  datasources: {
    db: {
      url:
        process.env.DATABASE_URL ??
        'postgresql://postgres:postgres@localhost:5432/courier_platform',
    },
  },
});
interface BatchResult {
  status: string;
  total: number;
  completed: number;
  successful: number;
  failed: number;
  items: Array<{ order_id: string; status: string }>;
}

const orderPayload = (orderId: string) => ({
  order_id: orderId,
  courier_partner: 'mock',
  pickup: {
    name: 'Integration Warehouse',
    phone: '9999999999',
    address_line1: '1 Depot Road',
    city: 'Bengaluru',
    state: 'Karnataka',
    postal_code: '560001',
    country: 'IN',
  },
  delivery: {
    name: 'Integration Customer',
    phone: '8888888888',
    address_line1: '2 Market Road',
    city: 'Mysuru',
    state: 'Karnataka',
    postal_code: '570001',
    country: 'IN',
  },
  package: { weight: 1.5 },
  payment: { type: 'PREPAID' },
});

async function waitForBatch(batchId: string) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await request(baseUrl).get(`/api/v1/batches/${batchId}`).expect(200);
    if (response.body.data.status !== 'PROCESSING') return response.body.data as BatchResult;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Batch ${batchId} did not complete`);
}

describe('Docker-backed API integration', () => {
  const orderId = `INT-${suffix}`;
  afterAll(async () => prisma.$disconnect());

  it('reports PostgreSQL and Redis health', async () => {
    const response = await request(baseUrl).get('/health').expect(200);
    expect(response.body.data).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });

  it('creates idempotently, rejects conflicts, lists, tracks, and cancels', async () => {
    const payload = orderPayload(orderId);
    const created = await request(baseUrl)
      .post('/api/v1/orders')
      .set('X-Request-ID', `integration-${suffix}`)
      .send(payload)
      .expect(201);
    expect(created.body.data).toMatchObject({
      order_id: orderId,
      courier_partner: 'mock',
      courier_order_id: `MOCK-${orderId}`,
      status: 'CREATED',
    });
    expect(created.headers['x-request-id']).toBe(`integration-${suffix}`);

    const duplicate = await request(baseUrl).post('/api/v1/orders').send(payload).expect(201);
    expect(duplicate.body.data.courier_order_id).toBe(`MOCK-${orderId}`);
    const persisted = await prisma.order.findMany({ where: { orderId } });
    expect(persisted).toHaveLength(1);
    expect(persisted[0]).toMatchObject({ processingState: 'COMPLETED' });
    expect(persisted[0].courierRequestPayload).not.toBeNull();
    expect(persisted[0].courierResponsePayload).not.toBeNull();

    const conflict = await request(baseUrl)
      .post('/api/v1/orders')
      .send({ ...payload, package: { weight: 2 } })
      .expect(409);
    expect(conflict.body.error.code).toBe('ORDER_ID_CONFLICT');

    const listed = await request(baseUrl)
      .get(`/api/v1/orders?courier_partner=mock&status=CREATED&limit=100`)
      .expect(200);
    expect(listed.body.data.orders).toEqual(
      expect.arrayContaining([expect.objectContaining({ order_id: orderId })]),
    );

    const tracked = await request(baseUrl).get(`/api/v1/orders/${orderId}/track`).expect(200);
    expect(tracked.body.data.status).toBe('IN_TRANSIT');
    await request(baseUrl).get(`/api/v1/orders/${orderId}/track`).expect(200);
    expect(await prisma.trackingEvent.count({ where: { orderRef: persisted[0].id } })).toBe(1);

    const cancelled = await request(baseUrl).post(`/api/v1/orders/${orderId}/cancel`).expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
    await request(baseUrl).post(`/api/v1/orders/${orderId}/cancel`).expect(200);
  });

  it('reserves one logical order under concurrent submissions', async () => {
    const concurrentId = `CONCURRENT-${suffix}`;
    const attempts = await Promise.all(
      Array.from({ length: 4 }, () =>
        request(baseUrl).post('/api/v1/orders').send(orderPayload(concurrentId)),
      ),
    );
    expect(attempts.some((attempt) => attempt.status === 201)).toBe(true);
    expect(await prisma.order.count({ where: { orderId: concurrentId } })).toBe(1);
    const order = await prisma.order.findUniqueOrThrow({ where: { orderId: concurrentId } });
    expect(order.courierOrderId).toBe(`MOCK-${concurrentId}`);
  });

  it('rejects unknown couriers without creating a shipment', async () => {
    const response = await request(baseUrl)
      .post('/api/v1/orders')
      .send({ ...orderPayload(`UNKNOWN-${suffix}`), courier_partner: 'missing' })
      .expect(400);
    expect(response.body.error).toMatchObject({
      code: 'UNKNOWN_COURIER',
      details: { supported_couriers: ['mock', 'urbanebolt'] },
    });
  });

  it('persists normalized courier failures without exposing raw errors', async () => {
    const failedId = `CREATE-${suffix}-FAIL`;
    const response = await request(baseUrl)
      .post('/api/v1/orders')
      .send(orderPayload(failedId))
      .expect(502);
    expect(response.body.error).toMatchObject({
      code: 'COURIER_REQUEST_REJECTED',
      message: 'Mock courier rejected the shipment',
    });
    expect(response.body.error).not.toHaveProperty('stack');
    const failed = await prisma.order.findUniqueOrThrow({ where: { orderId: failedId } });
    expect(failed).toMatchObject({
      processingState: 'FAILED',
      shipmentStatus: 'FAILED',
      failureCode: 'COURIER_REQUEST_REJECTED',
    });
    expect(failed.courierResponsePayload).not.toBeNull();
  });

  it('rejects invalid bulk sizes and duplicate IDs before creating a batch', async () => {
    await request(baseUrl).post('/api/v1/orders/bulk').send({ orders: [] }).expect(400);
    await request(baseUrl)
      .post('/api/v1/orders/bulk')
      .send({
        orders: Array.from({ length: 101 }, (_, index) => orderPayload(`MAX-${suffix}-${index}`)),
      })
      .expect(400);
    const duplicate = orderPayload(`DUP-${suffix}`);
    const response = await request(baseUrl)
      .post('/api/v1/orders/bulk')
      .send({ orders: [duplicate, duplicate] })
      .expect(400);
    expect(response.body.error.code).toBe('VALIDATION_ERROR');
  });

  it('processes a bulk batch with partial success', async () => {
    const successId = `BULK-${suffix}`;
    const failureId = `BULK-${suffix}-FAIL`;
    const accepted = await request(baseUrl)
      .post('/api/v1/orders/bulk')
      .send({ orders: [orderPayload(successId), orderPayload(failureId)] })
      .expect(202);
    const batch = await waitForBatch(accepted.body.data.batch_id);
    expect(batch).toMatchObject({
      status: 'PARTIALLY_COMPLETED',
      total: 2,
      completed: 2,
      successful: 1,
      failed: 1,
    });
    expect(batch.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ order_id: successId, status: 'SUCCESS' }),
        expect.objectContaining({ order_id: failureId, status: 'FAILED' }),
      ]),
    );
  });
});
