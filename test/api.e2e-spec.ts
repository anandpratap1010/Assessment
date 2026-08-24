import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request = require('supertest');
import { ApiExceptionFilter } from '../src/common/filters/api-exception.filter';
import { ResponseInterceptor } from '../src/common/interceptors/response.interceptor';
import { RequestIdMiddleware } from '../src/common/middleware/request-id.middleware';
import { BatchesController } from '../src/batches/batches.controller';
import { BatchesService } from '../src/batches/batches.service';
import { BULK_QUEUE } from '../src/batches/bulk.constants';
import { HealthController } from '../src/health/health.controller';
import { PrismaService } from '../src/database/prisma.service';
import { getQueueToken } from '@nestjs/bullmq';
import { OrdersController } from '../src/orders/orders.controller';
import { OrdersService } from '../src/orders/orders.service';
describe('Orders API (e2e HTTP contract)', () => {
  let app: INestApplication;
  const orders = {
    createOrder: jest.fn(),
    listOrders: jest.fn(),
    trackOrder: jest.fn(),
    cancelOrder: jest.fn(),
  };
  const batches = { create: jest.fn(), get: jest.fn() };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [OrdersController, BatchesController, HealthController],
      providers: [
        { provide: OrdersService, useValue: orders },
        { provide: BatchesService, useValue: batches },
        {
          provide: PrismaService,
          useValue: { $queryRaw: jest.fn().mockResolvedValue([{ ok: 1 }]) },
        },
        { provide: getQueueToken(BULK_QUEUE), useValue: { client: Promise.resolve({}) } },
      ],
    }).compile();
    app = module.createNestApplication();
    app.use(new RequestIdMiddleware().use.bind(new RequestIdMiddleware()));
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    app.useGlobalFilters(new ApiExceptionFilter());
    app.useGlobalInterceptors(new ResponseInterceptor());
    await app.init();
  });
  afterAll(() => app.close());
  it('creates a normalized order and preserves request ID', async () => {
    orders.createOrder.mockResolvedValue({
      order_id: 'E2E-1',
      courier_partner: 'mock',
      status: 'CREATED',
    });
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .set('X-Request-ID', 'test-request')
      .send({
        order_id: 'E2E-1',
        courier_partner: 'mock',
        pickup: {
          name: 'A',
          phone: '1',
          address_line1: 'A',
          city: 'C',
          state: 'S',
          postal_code: '1',
          country: 'IN',
        },
        delivery: {
          name: 'B',
          phone: '2',
          address_line1: 'B',
          city: 'C',
          state: 'S',
          postal_code: '2',
          country: 'IN',
        },
        package: { weight: 1 },
      })
      .expect(201);
    expect(response.headers['x-request-id']).toBe('test-request');
    expect(response.body).toMatchObject({
      success: true,
      data: { order_id: 'E2E-1' },
      request_id: 'test-request',
    });
  });
  it('returns normalized validation errors', async () => {
    const response = await request(app.getHttpServer())
      .post('/api/v1/orders')
      .send({ order_id: '' })
      .expect(400);
    expect(response.body).toMatchObject({ success: false, error: { code: 'VALIDATION_ERROR' } });
  });
  it('lists orders with validated pagination', async () => {
    orders.listOrders.mockResolvedValue({
      orders: [{ order_id: 'E2E-1', courier_partner: 'mock', status: 'CREATED' }],
      pagination: { page: 1, limit: 10, total: 1, total_pages: 1 },
    });
    const response = await request(app.getHttpServer())
      .get('/api/v1/orders?page=1&limit=10&courier_partner=mock')
      .expect(200);
    expect(response.body.data.orders).toHaveLength(1);
    await request(app.getHttpServer()).get('/api/v1/orders?limit=101').expect(400);
  });
  it('tracks and cancels through normalized endpoints', async () => {
    orders.trackOrder.mockResolvedValue({ order_id: 'E2E-1', status: 'IN_TRANSIT', events: [] });
    orders.cancelOrder.mockResolvedValue({ order_id: 'E2E-1', status: 'CANCELLED' });
    await request(app.getHttpServer()).get('/api/v1/orders/E2E-1/track').expect(200);
    const cancelled = await request(app.getHttpServer())
      .post('/api/v1/orders/E2E-1/cancel')
      .expect(200);
    expect(cancelled.body.data.status).toBe('CANCELLED');
  });
  it('queues and retrieves batches', async () => {
    batches.create.mockResolvedValue({
      batch_id: 'batch-1',
      status: 'PROCESSING',
      total_orders: 1,
    });
    batches.get.mockResolvedValue({ batch_id: 'batch-1', status: 'COMPLETED', total: 1 });
    const order = {
      order_id: 'BULK-1',
      courier_partner: 'mock',
      pickup: {
        name: 'A',
        phone: '1',
        address_line1: 'A',
        city: 'C',
        state: 'S',
        postal_code: '1',
        country: 'IN',
      },
      delivery: {
        name: 'B',
        phone: '2',
        address_line1: 'B',
        city: 'C',
        state: 'S',
        postal_code: '2',
        country: 'IN',
      },
      package: { weight: 1 },
    };
    await request(app.getHttpServer())
      .post('/api/v1/orders/bulk')
      .send({ orders: [order] })
      .expect(202);
    await request(app.getHttpServer()).get('/api/v1/batches/batch-1').expect(200);
  });
  it('reports dependency health', async () => {
    const response = await request(app.getHttpServer()).get('/health').expect(200);
    expect(response.body.data).toEqual({ status: 'ok', database: 'up', redis: 'up' });
  });
});
