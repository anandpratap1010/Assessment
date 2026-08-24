import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-code';
import {
  CancelShipmentResult,
  CreateShipmentResult,
  NormalizedAddress,
  NormalizedOrder,
  ShipmentStatus,
  TrackingResult,
} from '../courier.types';
import {
  UrbaneBoltCancelResponse,
  UrbaneBoltCreateRequest,
  UrbaneBoltCreateResponse,
  UrbaneBoltTrackingResponse,
} from './urbanebolt.types';

@Injectable()
export class UrbaneBoltMapper {
  constructor(private readonly config: ConfigService) {}

  toCreateRequest(order: NormalizedOrder): UrbaneBoltCreateRequest {
    const customerCode = this.config.get<string>('urbanebolt.customerCode', '').trim();
    if (!customerCode)
      throw new AppError(
        ErrorCode.COURIER_CONFIGURATION_ERROR,
        'URBANEBOLT_CUSTOMER_CODE is not configured',
      );
    const { length, width, height } = order.package;
    if (!length || !width || !height)
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'UrbaneBolt requires package length, width, and height',
        HttpStatus.BAD_REQUEST,
        { required_fields: ['package.length', 'package.width', 'package.height'] },
      );
    const declaredValue = order.package.declared_value ?? order.payment?.amount ?? 1;
    const quantity = order.package.quantity ?? 1;
    const invoiceDate = new Date().toISOString().slice(0, 10);
    return [
      {
        customerCode,
        orderNumber: order.order_id,
        declaredValue,
        itemDescription: order.package.description ?? 'Package',
        collectableValue: order.payment?.type === 'COD' ? (order.payment.amount ?? 0) : 0,
        height,
        length,
        pieces: quantity,
        weight: order.package.weight,
        breadth: width,
        serviceType: this.config.get<string>('urbanebolt.serviceType', 'SDD'),
        payMode: order.payment?.type === 'COD' ? 'COD' : 'PPD',
        ...this.pickupFields(order.pickup),
        ...this.deliveryFields(order.delivery),
        invoiceNumber: order.order_id,
        invoiceDate,
        invoiceValue: declaredValue,
        itemQuantity: quantity,
      },
    ];
  }

  fromCreateResponse(
    response: UrbaneBoltCreateResponse,
    requestPayload: UrbaneBoltCreateRequest,
  ): CreateShipmentResult {
    const created = response.successResponse?.[0];
    if (!created) {
      const rejected = response.errorResponse?.[0];
      throw new AppError(
        ErrorCode.COURIER_REQUEST_REJECTED,
        rejected?.message || 'UrbaneBolt rejected the shipment',
        HttpStatus.BAD_GATEWAY,
        null,
        response,
      );
    }
    return {
      courierOrderId: created.orderNumber,
      awbNumber: String(created.awbNumber),
      status: ShipmentStatus.CREATED,
      requestPayload,
      rawResponse: response,
    };
  }

  fromTrackingResponse(response: UrbaneBoltTrackingResponse): TrackingResult {
    const scans = response.data?.scans ?? [];
    const events = scans.map((scan) => ({
      status: this.mapStatus(scan.statusCode, scan.statusCodeDescription),
      courierStatus: scan.statusCode,
      timestamp: this.parseTimestamp(scan.statusDateTime),
      rawPayload: scan,
    }));
    const status = this.mapStatus(
      response.data.currentStatusCode,
      response.data.currentStatusCodeDescription,
    );
    return { status, events, rawResponse: response };
  }

  fromCancelResponse(response: UrbaneBoltCancelResponse): CancelShipmentResult {
    const success = response.successResponse?.[0];
    const failure = response.failureResponse?.[0];
    if (!success && !failure?.message.toLowerCase().includes('already cancelled'))
      throw new AppError(
        ErrorCode.COURIER_REQUEST_REJECTED,
        failure?.message || 'UrbaneBolt rejected the cancellation',
        HttpStatus.BAD_GATEWAY,
        null,
        response,
      );
    return {
      status: ShipmentStatus.CANCELLED,
      courierStatus: success ? 'CANCELLED' : 'ALREADY_CANCELLED',
      rawResponse: response,
    };
  }

  mapStatus(code: string, description: string): ShipmentStatus {
    const value = `${code} ${description}`.toLowerCase();
    if (code === 'CAN' || value.includes('cancel')) return ShipmentStatus.CANCELLED;
    if (value.includes('failed') || value.includes('lost') || value.includes('damaged'))
      return ShipmentStatus.FAILED;
    if (value.includes('deliver')) return ShipmentStatus.DELIVERED;
    if (value.includes('pickup') || value.includes('picked')) return ShipmentStatus.PICKED_UP;
    if (code === 'MAN' || value.includes('manifest') || value.includes('booked'))
      return ShipmentStatus.CREATED;
    if (
      value.includes('transit') ||
      value.includes('arrived') ||
      value.includes('departed') ||
      value.includes('out for delivery')
    )
      return ShipmentStatus.IN_TRANSIT;
    return ShipmentStatus.UNKNOWN;
  }

  private pickupFields(address: NormalizedAddress) {
    const common = this.address(address);
    return {
      rtnCity: address.city,
      rtnName: address.name,
      rtnEmail: address.email ?? '',
      rtnState: address.state,
      rtnMobile: this.number(address.phone, 'pickup.phone'),
      rtnAddress: common,
      rtnAddressType: 'Seller',
      rtnCountry: address.country,
      rtnPincode: this.number(address.postal_code, 'pickup.postal_code'),
      shprCity: address.city,
      shprName: address.name,
      shprEmail: address.email ?? '',
      shprState: address.state,
      shprMobile: this.number(address.phone, 'pickup.phone'),
      shprAddress: common,
      shprAddressType: 'Seller',
      shprCountry: address.country,
      shprPincode: this.number(address.postal_code, 'pickup.postal_code'),
    };
  }

  private deliveryFields(address: NormalizedAddress) {
    return {
      consCity: address.city,
      consName: address.name,
      consEmail: address.email ?? '',
      consState: address.state,
      consMobile: this.number(address.phone, 'delivery.phone'),
      consAddress: this.address(address),
      consAddressType: 'Home',
      consCountry: address.country,
      consPincode: this.number(address.postal_code, 'delivery.postal_code'),
    };
  }

  private address(value: NormalizedAddress): string {
    return [value.address_line1, value.address_line2].filter(Boolean).join(', ');
  }

  private number(value: string, field: string): number {
    const parsed = Number(value);
    if (!Number.isFinite(parsed))
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        `${field} must contain only digits for UrbaneBolt`,
        HttpStatus.BAD_REQUEST,
      );
    return parsed;
  }

  private parseTimestamp(value: string): Date {
    const parsed = Date.parse(value.replace(',', ''));
    return Number.isNaN(parsed) ? new Date() : new Date(parsed);
  }
}
