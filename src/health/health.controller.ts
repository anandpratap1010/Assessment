import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../database/prisma.service';
import { BULK_QUEUE } from '../batches/bulk.constants';
@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(
    private readonly prisma: PrismaService,
    @InjectQueue(BULK_QUEUE) private readonly queue: Queue,
  ) {}
  @Get() async get() {
    let database = 'up';
    let redis = 'up';
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch {
      database = 'down';
    }
    try {
      await this.queue.client;
    } catch {
      redis = 'down';
    }
    const status = database === 'up' && redis === 'up' ? 'ok' : 'degraded';
    if (status !== 'ok')
      throw new HttpException({ status, database, redis }, HttpStatus.SERVICE_UNAVAILABLE);
    return { status, database, redis };
  }
}
