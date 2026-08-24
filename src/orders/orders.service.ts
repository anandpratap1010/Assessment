import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import type { Order } from '@prisma/client';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-code';
import { currentRequestId } from '../common/request-context';
import { CourierRegistry } from '../couriers/courier-registry.service';
import { NormalizedOrder, ShipmentStatus } from '../couriers/courier.types';
import { CreateOrderDto } from './dto/create-order.dto';
import { ListOrdersQueryDto } from './dto/list-orders-query.dto';
import { OrdersRepository } from './orders.repository';
import { createRequestHash } from './request-hash';
@Injectable()
export class OrdersService {
  private readonly logger = new Logger(OrdersService.name);
  constructor(
    private readonly repository: OrdersRepository,
    private readonly courierRegistry: CourierRegistry,
  ) {}
  async createOrder(dto: CreateOrderDto) {
    const normalized = this.normalize(dto);
    const hash = createRequestHash(normalized);
    const adapter = this.courierRegistry.get(normalized.courier_partner);
    const reservation = await this.repository.reserveOrder(
      normalized.order_id,
      normalized.courier_partner,
      normalized,
      hash,
    );
    if (!reservation.acquired) return this.handleExisting(reservation.order, hash);
    try {
      const result = await adapter.createShipment(normalized);
      const persisted = await this.repository.markCreated(reservation.order!.id, result);
      return this.toCreateResponse(persisted);
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              ErrorCode.SHIPMENT_CREATE_FAILED,
              'Unable to create shipment',
              HttpStatus.BAD_GATEWAY,
            );
      await this.repository.markFailed(
        reservation.order!.id,
        appError.code,
        appError.message,
        appError.rawPayload,
      );
      this.logFailure(normalized.order_id, normalized.courier_partner, appError, error);
      throw appError;
    }
  }
  async listOrders(query: ListOrdersQueryDto) {
    const { orders, total } = await this.repository.list({
      page: query.page,
      limit: query.limit,
      courierPartner: query.courier_partner?.trim().toLowerCase(),
      status: query.status,
    });
    return {
      orders: orders.map((order) => this.toCreateResponse(order)),
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        total_pages: Math.ceil(total / query.limit),
      },
    };
  }
  async trackOrder(orderId: string) {
    const order = await this.requireOrder(orderId);
    if (!order.courierOrderId)
      throw new AppError(
        ErrorCode.TRACKING_FAILED,
        'Shipment has not been created',
        HttpStatus.CONFLICT,
      );
    const adapter = this.courierRegistry.get(order.courierPartner);
    let result;
    try {
      result = await adapter.trackShipment({
        orderId,
        courierOrderId: order.courierOrderId,
        awbNumber: order.awbNumber ?? undefined,
      });
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              ErrorCode.TRACKING_FAILED,
              'Unable to track shipment',
              HttpStatus.BAD_GATEWAY,
            );
      await this.repository.recordOperationFailure(
        order.id,
        appError.code,
        appError.message,
        appError.rawPayload,
      );
      this.logFailure(orderId, order.courierPartner, appError, error);
      throw appError;
    }
    await this.repository.updateStatus(order.id, result.status, result.rawResponse);
    for (const event of result.events) await this.repository.appendTrackingEvent(order.id, event);
    return {
      order_id: order.orderId,
      courier_partner: order.courierPartner,
      status: result.status,
      events: result.events.map((event) => ({
        status: event.status,
        courier_status: event.courierStatus,
        event_timestamp: event.timestamp.toISOString(),
      })),
    };
  }
  async cancelOrder(orderId: string) {
    const order = await this.requireOrder(orderId);
    if (order.shipmentStatus === ShipmentStatus.CANCELLED)
      return {
        order_id: order.orderId,
        courier_partner: order.courierPartner,
        status: ShipmentStatus.CANCELLED,
      };
    if (
      [ShipmentStatus.DELIVERED, ShipmentStatus.FAILED].includes(
        order.shipmentStatus as ShipmentStatus,
      )
    )
      throw new AppError(
        ErrorCode.CANCELLATION_FAILED,
        `Cannot cancel an order in ${order.shipmentStatus} status`,
        HttpStatus.CONFLICT,
      );
    if (!order.courierOrderId)
      throw new AppError(
        ErrorCode.CANCELLATION_FAILED,
        'Shipment has not been created',
        HttpStatus.CONFLICT,
      );
    const adapter = this.courierRegistry.get(order.courierPartner);
    let result;
    try {
      result = await adapter.cancelShipment({
        orderId,
        courierOrderId: order.courierOrderId,
        awbNumber: order.awbNumber ?? undefined,
      });
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(
              ErrorCode.CANCELLATION_FAILED,
              'Unable to cancel shipment',
              HttpStatus.BAD_GATEWAY,
            );
      await this.repository.recordOperationFailure(
        order.id,
        appError.code,
        appError.message,
        appError.rawPayload,
      );
      this.logFailure(orderId, order.courierPartner, appError, error);
      throw appError;
    }
    await this.repository.markCancelled(order.id, result.rawResponse);
    await this.repository.appendTrackingEvent(order.id, {
      status: result.status,
      courierStatus: result.courierStatus,
      timestamp: new Date(),
      rawPayload: result.rawResponse,
    });
    return {
      order_id: order.orderId,
      courier_partner: order.courierPartner,
      status: result.status,
    };
  }
  private async requireOrder(orderId: string): Promise<Order> {
    const order = await this.repository.findByOrderId(orderId);
    if (!order)
      throw new AppError(ErrorCode.ORDER_NOT_FOUND, 'Order not found', HttpStatus.NOT_FOUND);
    return order;
  }
  private async handleExisting(order: Order, hash: string) {
    if (order.requestHash !== hash)
      throw new AppError(
        ErrorCode.ORDER_ID_CONFLICT,
        'Order ID already exists with different shipment details',
        HttpStatus.CONFLICT,
      );
    if (order.processingState === 'PROCESSING' || order.processingState === 'PENDING')
      throw new AppError(
        ErrorCode.ORDER_IN_PROGRESS,
        'Order creation is already in progress',
        HttpStatus.CONFLICT,
      );
    if (order.processingState === 'FAILED')
      throw new AppError(
        (order.failureCode as ErrorCode) || ErrorCode.SHIPMENT_CREATE_FAILED,
        order.failureReason || 'Previous shipment creation failed',
        HttpStatus.BAD_GATEWAY,
      );
    return this.toCreateResponse(order);
  }
  private normalize(dto: CreateOrderDto): NormalizedOrder {
    return {
      order_id: dto.order_id.trim(),
      courier_partner: dto.courier_partner.trim().toLowerCase(),
      pickup: { ...dto.pickup },
      delivery: { ...dto.delivery },
      package: { ...dto.package },
      ...(dto.payment ? { payment: { ...dto.payment } } : {}),
      ...(dto.metadata ? { metadata: dto.metadata } : {}),
    };
  }
  private toCreateResponse(order: Order) {
    return {
      order_id: order.orderId,
      courier_partner: order.courierPartner,
      courier_order_id: order.courierOrderId,
      awb_number: order.awbNumber,
      status: order.shipmentStatus,
    };
  }

  private logFailure(
    orderId: string,
    courierPartner: string,
    appError: AppError,
    originalError: unknown,
  ): void {
    this.logger.error(
      JSON.stringify({
        requestId: currentRequestId(),
        orderId,
        courierPartner,
        errorCode: appError.code,
        errorType: originalError instanceof Error ? originalError.name : typeof originalError,
        message: appError.message,
        stack: originalError instanceof Error ? originalError.stack : undefined,
      }),
    );
  }
}
