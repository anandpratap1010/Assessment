import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { BulkCreateOrdersDto } from '../orders/dto/bulk-create-orders.dto';
import { BatchesService } from './batches.service';
@ApiTags('batches')
@Controller('api/v1')
export class BatchesController {
  constructor(private readonly batches: BatchesService) {}
  @Post('orders/bulk')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({ summary: 'Queue up to 100 orders' })
  create(@Body() dto: BulkCreateOrdersDto) {
    return this.batches.create(dto);
  }
  @Get('batches/:batchId') @ApiOperation({ summary: 'Get batch progress and item results' }) get(
    @Param('batchId') batchId: string,
  ) {
    return this.batches.get(batchId);
  }
}
