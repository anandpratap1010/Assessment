import { ConfigService } from '@nestjs/config';
import { NormalizedOrder, ShipmentStatus } from '../courier.types';
import { UrbaneBoltMapper } from './urbanebolt.mapper';

const order: NormalizedOrder = {
  order_id: 'URB-1',
  courier_partner: 'urbanebolt',
  pickup: {
    name: 'Warehouse',
    phone: '9999999999',
    address_line1: 'One',
    city: 'Gurgaon',
    state: 'Haryana',
    postal_code: '122001',
    country: 'INDIA',
  },
  delivery: {
    name: 'Customer',
    phone: '8888888888',
    address_line1: 'Two',
    city: 'Gurgaon',
    state: 'Haryana',
    postal_code: '122017',
    country: 'INDIA',
  },
  package: {
    weight: 1.1,
    length: 12,
    width: 10,
    height: 10,
    description: 'Books',
    declared_value: 100,
  },
  payment: { type: 'COD', amount: 50 },
};

describe('UrbaneBoltMapper', () => {
  const mapper = new UrbaneBoltMapper(
    new ConfigService({ urbanebolt: { customerCode: 'CUSTOMER', serviceType: 'SDD' } }),
  );

  it('maps a normalized order to the documented manifest payload', () => {
    expect(mapper.toCreateRequest(order)[0]).toMatchObject({
      customerCode: 'CUSTOMER',
      orderNumber: 'URB-1',
      breadth: 10,
      payMode: 'COD',
      collectableValue: 50,
      consPincode: 122017,
      shprPincode: 122001,
    });
  });

  it('maps a manifest success to a normalized shipment', () => {
    const payload = mapper.toCreateRequest(order);
    expect(
      mapper.fromCreateResponse(
        {
          status: 'Success',
          successResponse: [{ status: 'Success', orderNumber: 'URB-1', awbNumber: 2001 }],
          errorResponse: [],
        },
        payload,
      ),
    ).toMatchObject({
      courierOrderId: 'URB-1',
      awbNumber: '2001',
      status: ShipmentStatus.CREATED,
    });
  });

  it('maps documented tracking statuses and scans', () => {
    const result = mapper.fromTrackingResponse({
      status: 'Success',
      data: {
        awbNumber: 2001,
        orderNumber: 'URB-1',
        currentStatusDateTime: '03 May 2025, 15:47',
        currentStatusCode: 'CAN',
        currentStatusCodeDescription: 'Cancelled',
        scans: [
          {
            statusDateTime: '03 May 2025, 15:44',
            statusCode: 'MAN',
            statusCodeDescription: 'Shipment Manifested',
          },
        ],
      },
    });
    expect(result.status).toBe(ShipmentStatus.CANCELLED);
    expect(result.events[0].status).toBe(ShipmentStatus.CREATED);
  });

  it('normalizes successful and already-cancelled responses', () => {
    expect(
      mapper.fromCancelResponse({
        status: 'Success',
        successResponse: [{ awb: '2001', message: 'Cancelled' }],
        failureResponse: [],
      }).status,
    ).toBe(ShipmentStatus.CANCELLED);
    expect(
      mapper.fromCancelResponse({
        status: 'Success',
        successResponse: [],
        failureResponse: [{ awb: '2001', message: 'Shipment already cancelled!' }],
      }).status,
    ).toBe(ShipmentStatus.CANCELLED);
  });

  it('maps unknown courier statuses without leaking them into the public status', () => {
    expect(mapper.mapStatus('FAIL', 'Delivery failed')).toBe(ShipmentStatus.FAILED);
    expect(mapper.mapStatus('NEW_CODE', 'Unrecognized state')).toBe(ShipmentStatus.UNKNOWN);
  });
});
