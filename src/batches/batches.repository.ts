import { Injectable } from '@nestjs/common';
import { BatchItemStatus, BatchStatus } from '@prisma/client';
import { PrismaService } from '../database/prisma.service';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
@Injectable()
export class BatchesRepository {
  constructor(private readonly prisma: PrismaService) {}
  create(batchId: string, orders: CreateOrderDto[]) {
    return this.prisma.bulkBatch.create({
      data: {
        batchId,
        totalOrders: orders.length,
        items: {
          create: orders.map((order) => ({
            orderId: order.order_id,
            courierPartner: order.courier_partner.toLowerCase(),
          })),
        },
      },
      include: { items: true },
    });
  }
  find(batchId: string) {
    return this.prisma.bulkBatch.findUnique({
      where: { batchId },
      include: { items: { orderBy: { createdAt: 'asc' } } },
    });
  }

  async markEnqueueFailed(batchRef: string, code: string, message: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const total = await tx.bulkBatchItem.count({ where: { batchRef } });
      await tx.bulkBatchItem.updateMany({
        where: { batchRef, status: BatchItemStatus.PENDING },
        data: { status: BatchItemStatus.FAILED, errorCode: code, errorMessage: message },
      });
      await tx.bulkBatch.update({
        where: { id: batchRef },
        data: {
          status: BatchStatus.FAILED,
          completedOrders: total,
          failedOrders: total,
        },
      });
    });
  }
  markProcessing(batchId: string, orderId: string) {
    return this.prisma.bulkBatchItem.update({
      where: { batchRef_orderId: { batchRef: batchId, orderId } },
      data: { status: BatchItemStatus.PROCESSING },
    });
  }
  async completeItem(
    batchRef: string,
    orderId: string,
    success: boolean,
    orderRef?: string,
    error?: { code: string; message: string },
  ): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const item = await tx.bulkBatchItem.findUnique({
        where: { batchRef_orderId: { batchRef, orderId } },
      });
      if (
        !item ||
        item.status === BatchItemStatus.SUCCESS ||
        item.status === BatchItemStatus.FAILED
      )
        return;
      await tx.bulkBatchItem.update({
        where: { id: item.id },
        data: {
          status: success ? BatchItemStatus.SUCCESS : BatchItemStatus.FAILED,
          orderRef,
          errorCode: error?.code,
          errorMessage: error?.message,
        },
      });
      const batch = await tx.bulkBatch.update({
        where: { id: batchRef },
        data: {
          completedOrders: { increment: 1 },
          ...(success
            ? { successfulOrders: { increment: 1 } }
            : { failedOrders: { increment: 1 } }),
        },
      });
      const completed = batch.completedOrders;
      const status =
        completed < batch.totalOrders
          ? BatchStatus.PROCESSING
          : batch.successfulOrders === batch.totalOrders
            ? BatchStatus.COMPLETED
            : batch.failedOrders === batch.totalOrders
              ? BatchStatus.FAILED
              : BatchStatus.PARTIALLY_COMPLETED;
      if (status !== batch.status)
        await tx.bulkBatch.update({ where: { id: batchRef }, data: { status } });
    });
  }
}
