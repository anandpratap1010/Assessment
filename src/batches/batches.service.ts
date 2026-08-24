import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { randomUUID } from 'node:crypto';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-code';
import { currentRequestId } from '../common/request-context';
import { CourierRegistry } from '../couriers/courier-registry.service';
import { BulkCreateOrdersDto } from '../orders/dto/bulk-create-orders.dto';
import { BatchesRepository } from './batches.repository';
import { BULK_JOB, BULK_QUEUE } from './bulk.constants';
@Injectable()
export class BatchesService {
  constructor(
    private readonly repository: BatchesRepository,
    @InjectQueue(BULK_QUEUE) private readonly queue: Queue,
    private readonly courierRegistry: CourierRegistry,
  ) {}
  async create(dto: BulkCreateOrdersDto) {
    const ids = dto.orders.map((order) => order.order_id);
    const duplicates = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
    if (duplicates.length)
      throw new AppError(
        ErrorCode.VALIDATION_ERROR,
        'Bulk request contains duplicate order IDs',
        HttpStatus.BAD_REQUEST,
        { duplicate_order_ids: duplicates },
      );
    for (const order of dto.orders) this.courierRegistry.get(order.courier_partner);
    const batchId = randomUUID();
    const batch = await this.repository.create(batchId, dto.orders);
    try {
      await this.queue.addBulk(
        dto.orders.map((order) => ({
          name: BULK_JOB,
          data: { batchRef: batch.id, order, requestId: currentRequestId() },
          opts: { attempts: 1, removeOnComplete: 1000, removeOnFail: 1000 },
        })),
      );
    } catch {
      await this.repository.markEnqueueFailed(
        batch.id,
        ErrorCode.BATCH_ENQUEUE_FAILED,
        'Bulk queue is unavailable',
      );
      throw new AppError(
        ErrorCode.BATCH_ENQUEUE_FAILED,
        'Bulk queue is unavailable',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return { batch_id: batch.batchId, status: batch.status, total_orders: batch.totalOrders };
  }
  async get(batchId: string) {
    const batch = await this.repository.find(batchId);
    if (!batch)
      throw new AppError(ErrorCode.BATCH_NOT_FOUND, 'Batch not found', HttpStatus.NOT_FOUND);
    return {
      batch_id: batch.batchId,
      status: batch.status,
      total: batch.totalOrders,
      completed: batch.completedOrders,
      successful: batch.successfulOrders,
      failed: batch.failedOrders,
      items: batch.items.map((item) => ({
        order_id: item.orderId,
        status: item.status,
        ...(item.errorCode ? { error: { code: item.errorCode, message: item.errorMessage } } : {}),
      })),
    };
  }
}
