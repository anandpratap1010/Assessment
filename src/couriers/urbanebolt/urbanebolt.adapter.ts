import { Injectable } from '@nestjs/common';
import { CourierAdapter } from '../courier-adapter.interface';
import {
  CancelShipmentResult,
  CreateShipmentResult,
  NormalizedOrder,
  ShipmentReference,
  TrackingResult,
} from '../courier.types';
import { urbaneboltContractUnavailable } from './urbanebolt.errors';
import { UrbaneBoltClient } from './urbanebolt.client';
import { UrbaneBoltMapper } from './urbanebolt.mapper';
import {
  UrbaneBoltCancelResponse,
  UrbaneBoltCreateResponse,
  UrbaneBoltTrackingResponse,
} from './urbanebolt.types';
@Injectable()
export class UrbaneBoltAdapter implements CourierAdapter {
  readonly partner = 'urbanebolt';
  constructor(
    private readonly client: UrbaneBoltClient,
    private readonly mapper: UrbaneBoltMapper,
  ) {}
  async createShipment(order: NormalizedOrder): Promise<CreateShipmentResult> {
    const payload = this.mapper.toCreateRequest(order);
    const response = await this.client.request<UrbaneBoltCreateResponse>({
      method: 'POST',
      url: '/api/v1/services/manifest/',
      data: payload,
    });
    return this.mapper.fromCreateResponse(response, payload);
  }
  async trackShipment(shipment: ShipmentReference): Promise<TrackingResult> {
    if (!shipment.awbNumber) throw urbaneboltContractUnavailable('Tracking requires an AWB number');
    const response = await this.client.request<UrbaneBoltTrackingResponse>({
      method: 'GET',
      url: '/api/v1/services/tracking-pub/',
      params: { awb: shipment.awbNumber },
    });
    return this.mapper.fromTrackingResponse(response);
  }
  async cancelShipment(shipment: ShipmentReference): Promise<CancelShipmentResult> {
    if (!shipment.awbNumber)
      throw urbaneboltContractUnavailable('Cancellation requires an AWB number');
    const response = await this.client.request<UrbaneBoltCancelResponse>({
      method: 'POST',
      url: '/api/v1/services/cancel/',
      data: { awbs: shipment.awbNumber },
    });
    return this.mapper.fromCancelResponse(response);
  }
}
