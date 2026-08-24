import {
  CancelShipmentResult,
  CreateShipmentResult,
  NormalizedOrder,
  ShipmentReference,
  TrackingResult,
} from './courier.types';
export interface CourierAdapter {
  readonly partner: string;
  createShipment(order: NormalizedOrder): Promise<CreateShipmentResult>;
  trackShipment(shipment: ShipmentReference): Promise<TrackingResult>;
  cancelShipment(shipment: ShipmentReference): Promise<CancelShipmentResult>;
}
export const COURIER_ADAPTERS = Symbol('COURIER_ADAPTERS');
