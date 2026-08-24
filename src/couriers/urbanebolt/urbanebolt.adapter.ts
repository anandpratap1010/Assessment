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
@Injectable()
export class UrbaneBoltAdapter implements CourierAdapter {
  readonly partner = 'urbanebolt';
  constructor(
    private readonly client: UrbaneBoltClient,
    private readonly mapper: UrbaneBoltMapper,
  ) {}
  async createShipment(order: NormalizedOrder): Promise<CreateShipmentResult> {
    this.mapper.toCreateRequest(order);
    void this.client;
    throw urbaneboltContractUnavailable();
  }
  async trackShipment(_shipment: ShipmentReference): Promise<TrackingResult> {
    throw urbaneboltContractUnavailable();
  }
  async cancelShipment(_shipment: ShipmentReference): Promise<CancelShipmentResult> {
    throw urbaneboltContractUnavailable();
  }
}
