import { CourierRegistry } from '../couriers/courier-registry.service';
import { MockCourierAdapter } from '../couriers/mock/mock-courier.adapter';
import { BulkCreateOrdersDto } from '../orders/dto/bulk-create-orders.dto';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { BatchesService } from './batches.service';

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
} as CreateOrderDto;

describe('BatchesService', () => {
  const repository = { create: jest.fn(), markEnqueueFailed: jest.fn() };
  const queue = { addBulk: jest.fn() };
  const registry = new CourierRegistry([new MockCourierAdapter()]);
  const service = new BatchesService(repository as any, queue as any, registry);

  beforeEach(() => jest.clearAllMocks());

  it('rejects duplicate IDs before persistence', async () => {
    await expect(
      service.create({ orders: [order, { ...order }] } as BulkCreateOrdersDto),
    ).rejects.toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('rejects unsupported couriers before persistence', async () => {
    await expect(
      service.create({ orders: [{ ...order, courier_partner: 'missing' }] }),
    ).rejects.toMatchObject({ code: 'UNKNOWN_COURIER' });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('persists and enqueues one job per valid order', async () => {
    repository.create.mockResolvedValue({
      id: 'internal-batch',
      batchId: 'batch-1',
      status: 'PROCESSING',
      totalOrders: 2,
    });
    queue.addBulk.mockResolvedValue([]);
    const second = { ...order, order_id: 'BULK-2' };
    await expect(service.create({ orders: [order, second] })).resolves.toMatchObject({
      batch_id: 'batch-1',
      total_orders: 2,
    });
    expect(queue.addBulk).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({ data: expect.objectContaining({ order }) }),
        expect.objectContaining({ data: expect.objectContaining({ order: second }) }),
      ]),
    );
  });

  it('marks the persisted batch failed when enqueueing fails', async () => {
    repository.create.mockResolvedValue({
      id: 'internal-batch',
      batchId: 'batch-1',
      status: 'PROCESSING',
      totalOrders: 1,
    });
    queue.addBulk.mockRejectedValue(new Error('redis unavailable'));
    await expect(service.create({ orders: [order] })).rejects.toMatchObject({
      code: 'BATCH_ENQUEUE_FAILED',
    });
    expect(repository.markEnqueueFailed).toHaveBeenCalledWith(
      'internal-batch',
      'BATCH_ENQUEUE_FAILED',
      'Bulk queue is unavailable',
    );
  });
});
