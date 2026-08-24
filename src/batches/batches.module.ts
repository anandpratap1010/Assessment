import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { OrdersModule } from '../orders/orders.module';
import { BatchesController } from './batches.controller';
import { BatchesRepository } from './batches.repository';
import { BatchesService } from './batches.service';
import { BULK_QUEUE } from './bulk.constants';
import { BulkOrderProcessor } from './bulk-order.processor';
@Module({
  imports: [OrdersModule, BullModule.registerQueue({ name: BULK_QUEUE })],
  controllers: [BatchesController],
  providers: [BatchesRepository, BatchesService, BulkOrderProcessor],
  exports: [BatchesService],
})
export class BatchesModule {}
