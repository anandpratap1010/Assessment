import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { BULK_QUEUE } from '../batches/bulk.constants';
import { HealthController } from './health.controller';
@Module({
  imports: [BullModule.registerQueue({ name: BULK_QUEUE })],
  controllers: [HealthController],
})
export class HealthModule {}
