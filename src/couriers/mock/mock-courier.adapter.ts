import { Injectable, HttpStatus } from '@nestjs/common';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-code';
import { CourierAdapter } from '../courier-adapter.interface';
import {
  CancelShipmentResult,
  CreateShipmentResult,
  NormalizedOrder,
  ShipmentReference,
  ShipmentStatus,
  TrackingResult,
} from '../courier.types';
@Injectable()
export class MockCourierAdapter implements CourierAdapter {
  readonly partner = 'mock';
  async createShipment(order: NormalizedOrder): Promise<CreateShipmentResult> {
    if (order.order_id.endsWith('FAIL'))
      throw new AppError(
        ErrorCode.COURIER_REQUEST_REJECTED,
        'Mock courier rejected the shipment',
        HttpStatus.BAD_GATEWAY,
        null,
        { reason: 'deterministic_failure' },
      );
    if (order.order_id.endsWith('TIMEOUT'))
      throw new AppError(
        ErrorCode.COURIER_TIMEOUT,
        'Mock courier timed out',
        HttpStatus.GATEWAY_TIMEOUT,
      );
    const requestPayload = {
      reference: order.order_id,
      pickup: order.pickup,
      delivery: order.delivery,
      parcel: order.package,
      payment: order.payment,
    };
    return {
      courierOrderId: `MOCK-${order.order_id}`,
      awbNumber: `AWB-${order.order_id}`,
      status: ShipmentStatus.CREATED,
      requestPayload,
      rawResponse: {
        shipment_id: `MOCK-${order.order_id}`,
        waybill: `AWB-${order.order_id}`,
        state: 'created',
      },
    };
  }
  async trackShipment(shipment: ShipmentReference): Promise<TrackingResult> {
    const timestamp = new Date('2026-01-01T00:00:00.000Z');
    return {
      status: ShipmentStatus.IN_TRANSIT,
      events: [
        {
          status: ShipmentStatus.IN_TRANSIT,
          courierStatus: 'moving',
          timestamp,
          rawPayload: {
            reference: shipment.courierOrderId,
            state: 'moving',
            occurred_at: timestamp.toISOString(),
          },
        },
      ],
      rawResponse: { state: 'moving' },
    };
  }
  async cancelShipment(shipment: ShipmentReference): Promise<CancelShipmentResult> {
    return {
      status: ShipmentStatus.CANCELLED,
      courierStatus: 'cancelled',
      rawResponse: { reference: shipment.courierOrderId, state: 'cancelled' },
    };
  }
}
