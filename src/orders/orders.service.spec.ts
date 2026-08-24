import { ProcessingState, ShipmentStatus, type Order } from '@prisma/client';
import { ErrorCode } from '../common/errors/error-code';
import { MockCourierAdapter } from '../couriers/mock/mock-courier.adapter';
import { CourierRegistry } from '../couriers/courier-registry.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';
const dto = {
  order_id: 'ORD-1',
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
const baseOrder = {
  id: 'id',
  orderId: 'ORD-1',
  courierPartner: 'mock',
  courierOrderId: 'MOCK-ORD-1',
  awbNumber: 'AWB-ORD-1',
  shipmentStatus: ShipmentStatus.CREATED,
  processingState: ProcessingState.COMPLETED,
  normalizedRequest: {},
  requestHash: '',
  courierRequestPayload: null,
  courierResponsePayload: null,
  failureCode: null,
  failureReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};
describe('OrdersService', () => {
  let repository: any;
  let service: OrdersService;
  beforeEach(() => {
    repository = {
      list: jest.fn(),
      reserveOrder: jest.fn(),
      findByOrderId: jest.fn(),
      markCreated: jest.fn(),
      markFailed: jest.fn(),
      updateStatus: jest.fn(),
      appendTrackingEvent: jest.fn(),
      markCancelled: jest.fn(),
      recordOperationFailure: jest.fn(),
    };
    service = new OrdersService(repository, new CourierRegistry([new MockCourierAdapter()]));
  });
  it('returns a paginated normalized order list', async () => {
    repository.list.mockResolvedValue({ orders: [baseOrder], total: 1 });
    await expect(service.listOrders({ page: 1, limit: 20 })).resolves.toEqual({
      orders: [expect.objectContaining({ order_id: 'ORD-1', courier_partner: 'mock' })],
      pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
    });
  });
  it('creates and persists a shipment', async () => {
    repository.reserveOrder.mockResolvedValue({
      acquired: true,
      order: { ...baseOrder, courierOrderId: null, awbNumber: null },
    });
    repository.markCreated.mockImplementation((_id: string, result: any) => ({
      ...baseOrder,
      courierOrderId: result.courierOrderId,
      awbNumber: result.awbNumber,
    }));
    await expect(service.createOrder(dto)).resolves.toMatchObject({
      order_id: 'ORD-1',
      courier_order_id: 'MOCK-ORD-1',
    });
    expect(repository.markCreated).toHaveBeenCalledTimes(1);
  });
  it('returns a completed identical duplicate', async () => {
    const firstRepo: any = { ...repository };
    firstRepo.reserveOrder = jest
      .fn()
      .mockImplementation(async (_a: string, _b: string, _c: any, hash: string) => ({
        acquired: false,
        order: { ...baseOrder, requestHash: hash },
      }));
    service = new OrdersService(firstRepo, new CourierRegistry([new MockCourierAdapter()]));
    await expect(service.createOrder(dto)).resolves.toMatchObject({ order_id: 'ORD-1' });
  });
  it('rejects a conflicting duplicate', async () => {
    repository.reserveOrder.mockResolvedValue({
      acquired: false,
      order: { ...baseOrder, requestHash: 'different' },
    });
    await expect(service.createOrder(dto)).rejects.toMatchObject({
      code: ErrorCode.ORDER_ID_CONFLICT,
    });
  });
  it('persists courier failure', async () => {
    repository.reserveOrder.mockResolvedValue({
      acquired: true,
      order: { ...baseOrder, id: 'failed' },
    });
    await expect(service.createOrder({ ...dto, order_id: 'ORD-FAIL' })).rejects.toMatchObject({
      code: ErrorCode.COURIER_REQUEST_REJECTED,
    });
    expect(repository.markFailed).toHaveBeenCalled();
  });
  it('tracks and appends events', async () => {
    repository.findByOrderId.mockResolvedValue(baseOrder);
    const result = await service.trackOrder('ORD-1');
    expect(result.status).toBe('IN_TRANSIT');
    expect(repository.appendTrackingEvent).toHaveBeenCalledTimes(1);
  });
  it('cancels and appends an audit event', async () => {
    repository.findByOrderId.mockResolvedValue(baseOrder);
    await expect(service.cancelOrder('ORD-1')).resolves.toMatchObject({ status: 'CANCELLED' });
    expect(repository.markCancelled).toHaveBeenCalled();
    expect(repository.appendTrackingEvent).toHaveBeenCalled();
  });
  it('allows only one courier call for concurrent identical submissions', async () => {
    let stored: Order | undefined;
    const concurrentRepository: any = {
      reserveOrder: jest
        .fn()
        .mockImplementation(
          async (_orderId: string, _partner: string, _request: unknown, requestHash: string) => {
            if (stored) return { acquired: false, order: stored };
            stored = {
              ...baseOrder,
              courierOrderId: null,
              awbNumber: null,
              processingState: ProcessingState.PROCESSING,
              requestHash,
            };
            return { acquired: true, order: stored };
          },
        ),
      markCreated: jest.fn().mockImplementation(async (_id: string, result: any) => {
        stored = {
          ...stored!,
          courierOrderId: result.courierOrderId,
          awbNumber: result.awbNumber,
          processingState: ProcessingState.COMPLETED,
        };
        return stored;
      }),
      markFailed: jest.fn(),
    };
    const adapter = new MockCourierAdapter();
    const courierCall = jest.spyOn(adapter, 'createShipment').mockImplementation(async (order) => {
      await new Promise((resolve) => setTimeout(resolve, 10));
      return new MockCourierAdapter().createShipment(order);
    });
    const concurrentService = new OrdersService(
      concurrentRepository,
      new CourierRegistry([adapter]),
    );
    const results = await Promise.allSettled([
      concurrentService.createOrder(dto),
      concurrentService.createOrder(dto),
      concurrentService.createOrder(dto),
      concurrentService.createOrder(dto),
    ]);
    expect(courierCall).toHaveBeenCalledTimes(1);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(3);
    expect(stored?.processingState).toBe(ProcessingState.COMPLETED);
  });
});
