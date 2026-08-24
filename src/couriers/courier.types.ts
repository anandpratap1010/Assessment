export enum ShipmentStatus {
  CREATED = 'CREATED',
  PICKED_UP = 'PICKED_UP',
  IN_TRANSIT = 'IN_TRANSIT',
  DELIVERED = 'DELIVERED',
  CANCELLED = 'CANCELLED',
  FAILED = 'FAILED',
  UNKNOWN = 'UNKNOWN',
}
export enum ProcessingState {
  PENDING = 'PENDING',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
}
export interface NormalizedAddress {
  name: string;
  phone: string;
  address_line1: string;
  address_line2?: string;
  city: string;
  state: string;
  postal_code: string;
  country: string;
  email?: string;
}
export interface NormalizedOrder {
  order_id: string;
  courier_partner: string;
  pickup: NormalizedAddress;
  delivery: NormalizedAddress;
  package: {
    weight: number;
    length?: number;
    width?: number;
    height?: number;
    description?: string;
    declared_value?: number;
    quantity?: number;
  };
  payment?: { type: 'PREPAID' | 'COD'; amount?: number };
  metadata?: Record<string, unknown>;
}
export interface ShipmentReference {
  orderId: string;
  courierOrderId: string;
  awbNumber?: string;
}
export interface CreateShipmentResult {
  courierOrderId: string;
  awbNumber?: string;
  status: ShipmentStatus;
  requestPayload: unknown;
  rawResponse: unknown;
}
export interface TrackingEventResult {
  status: ShipmentStatus;
  courierStatus?: string;
  timestamp: Date;
  rawPayload: unknown;
}
export interface TrackingResult {
  status: ShipmentStatus;
  events: TrackingEventResult[];
  rawResponse: unknown;
}
export interface CancelShipmentResult {
  status: ShipmentStatus;
  courierStatus?: string;
  rawResponse: unknown;
}
