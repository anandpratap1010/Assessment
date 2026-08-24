import { Injectable } from '@nestjs/common';
import { Prisma, ProcessingState, ShipmentStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { TrackingEventResult } from '../couriers/courier.types';
import { createRequestHash } from './request-hash';
export type ReserveResult =
  | { acquired: true; order: Awaited<ReturnType<OrdersRepository['findByOrderId']>> }
  | { acquired: false; order: NonNullable<Awaited<ReturnType<OrdersRepository['findByOrderId']>>> };
@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}
  async reserveOrder(
    orderId: string,
    courierPartner: string,
    normalizedRequest: unknown,
    requestHash: string,
  ): Promise<ReserveResult> {
    try {
      const order = await this.prisma.order.create({
        data: {
          orderId,
          courierPartner,
          normalizedRequest: normalizedRequest as Prisma.InputJsonValue,
          requestHash,
          processingState: ProcessingState.PROCESSING,
        },
      });
      return { acquired: true, order };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        const order = await this.findByOrderId(orderId);
        if (!order) throw error;
        return { acquired: false, order };
      }
      throw error;
    }
  }
  findByOrderId(orderId: string) {
    return this.prisma.order.findUnique({ where: { orderId } });
  }
  async list(options: {
    page: number;
    limit: number;
    courierPartner?: string;
    status?: ShipmentStatus;
  }) {
    const where: Prisma.OrderWhereInput = {
      ...(options.courierPartner ? { courierPartner: options.courierPartner } : {}),
      ...(options.status ? { shipmentStatus: options.status } : {}),
    };
    const [orders, total] = await this.prisma.$transaction([
      this.prisma.order.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.limit,
        take: options.limit,
      }),
      this.prisma.order.count({ where }),
    ]);
    return { orders, total };
  }
  async markCreated(
    id: string,
    result: {
      courierOrderId: string;
      awbNumber?: string;
      status: string;
      requestPayload: unknown;
      rawResponse: unknown;
    },
  ) {
    return this.prisma.order.update({
      where: { id },
      data: {
        courierOrderId: result.courierOrderId,
        awbNumber: result.awbNumber,
        shipmentStatus: result.status as ShipmentStatus,
        processingState: ProcessingState.COMPLETED,
        courierRequestPayload: result.requestPayload as Prisma.InputJsonValue,
        courierResponsePayload: result.rawResponse as Prisma.InputJsonValue,
        failureCode: null,
        failureReason: null,
      },
    });
  }
  async markFailed(id: string, code: string, reason: string, raw?: unknown) {
    return this.prisma.order.update({
      where: { id },
      data: {
        processingState: ProcessingState.FAILED,
        shipmentStatus: ShipmentStatus.FAILED,
        failureCode: code,
        failureReason: reason,
        ...(raw !== undefined ? { courierResponsePayload: raw as Prisma.InputJsonValue } : {}),
      },
    });
  }
  async updateStatus(id: string, status: string, rawResponse: unknown) {
    return this.prisma.order.update({
      where: { id },
      data: {
        shipmentStatus: status as ShipmentStatus,
        courierResponsePayload: rawResponse as Prisma.InputJsonValue,
        failureCode: null,
        failureReason: null,
      },
    });
  }
  async recordOperationFailure(id: string, code: string, reason: string, raw?: unknown) {
    return this.prisma.order.update({
      where: { id },
      data: {
        failureCode: code,
        failureReason: reason,
        ...(raw !== undefined ? { courierResponsePayload: raw as Prisma.InputJsonValue } : {}),
      },
    });
  }
  async appendTrackingEvent(orderRef: string, event: TrackingEventResult): Promise<void> {
    const fingerprint = createRequestHash({
      status: event.status,
      courierStatus: event.courierStatus ?? null,
      timestamp: event.timestamp.toISOString(),
      raw: event.rawPayload,
    });
    try {
      await this.prisma.trackingEvent.create({
        data: {
          orderRef,
          status: event.status as ShipmentStatus,
          courierStatus: event.courierStatus,
          rawPayload: event.rawPayload as Prisma.InputJsonValue,
          eventTimestamp: event.timestamp,
          eventFingerprint: fingerprint,
        },
      });
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'))
        throw error;
    }
  }
  async markCancelled(id: string, rawResponse: unknown) {
    return this.prisma.order.update({
      where: { id },
      data: {
        shipmentStatus: ShipmentStatus.CANCELLED,
        courierResponsePayload: rawResponse as Prisma.InputJsonValue,
        failureCode: null,
        failureReason: null,
      },
    });
  }
  countTrackingEvents(orderRef: string) {
    return this.prisma.trackingEvent.count({ where: { orderRef } });
  }
}
