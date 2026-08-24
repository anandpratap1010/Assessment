import { ErrorCode } from '../../common/errors/error-code';
import { NormalizedOrder, ShipmentStatus } from '../courier.types';
import { MockCourierAdapter } from './mock-courier.adapter';
const order = {
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
} satisfies NormalizedOrder;
describe('MockCourierAdapter', () => {
  const adapter = new MockCourierAdapter();
  it('creates deterministic shipments', async () =>
    expect(await adapter.createShipment(order)).toMatchObject({
      courierOrderId: 'MOCK-ORD-1',
      awbNumber: 'AWB-ORD-1',
      status: ShipmentStatus.CREATED,
    }));
  it('tracks shipments', async () =>
    expect(
      (await adapter.trackShipment({ orderId: 'ORD-1', courierOrderId: 'MOCK-ORD-1' })).status,
    ).toBe(ShipmentStatus.IN_TRANSIT));
  it('cancels shipments', async () =>
    expect(
      (await adapter.cancelShipment({ orderId: 'ORD-1', courierOrderId: 'MOCK-ORD-1' })).status,
    ).toBe(ShipmentStatus.CANCELLED));
  it('provides deterministic failure', async () =>
    expect(adapter.createShipment({ ...order, order_id: 'ORD-FAIL' })).rejects.toMatchObject({
      code: ErrorCode.COURIER_REQUEST_REJECTED,
    }));
});
