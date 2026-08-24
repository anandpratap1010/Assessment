import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-code';
import { CreateOrderDto } from '../orders/dto/create-order.dto';
import { OrdersRepository } from '../orders/orders.repository';
import { OrdersService } from '../orders/orders.service';
import { BatchesRepository } from './batches.repository';
import { BULK_QUEUE } from './bulk.constants';
@Processor(BULK_QUEUE, { concurrency: Number(process.env.BULK_WORKER_CONCURRENCY ?? 10) })
export class BulkOrderProcessor extends WorkerHost {
  private readonly logger = new Logger(BulkOrderProcessor.name);
  constructor(
    private readonly orders: OrdersService,
    private readonly orderRepository: OrdersRepository,
    private readonly batches: BatchesRepository,
  ) {
    super();
  }
  async process(job: Job<{ batchRef: string; order: CreateOrderDto }>): Promise<void> {
    const { batchRef, order } = job.data;
    try {
      await this.orders.createOrder(order);
      const saved = await this.orderRepository.findByOrderId(order.order_id);
      await this.batches.completeItem(batchRef, order.order_id, true, saved?.id);
    } catch (error) {
      const appError =
        error instanceof AppError
          ? error
          : new AppError(ErrorCode.INTERNAL_ERROR, 'Bulk order processing failed');
      await this.batches.completeItem(batchRef, order.order_id, false, undefined, {
        code: appError.code,
        message: appError.message,
      });
    }
  }
  @OnWorkerEvent('error') onError(error: Error): void {
    this.logger.error(
      JSON.stringify({ errorType: error.name, message: error.message, stack: error.stack }),
    );
  }
}
