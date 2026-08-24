import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';
@ApiTags('orders')
@Controller('api/v1/orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}
  @Post() @ApiOperation({ summary: 'Create an idempotent shipment' }) create(
    @Body() dto: CreateOrderDto,
  ) {
    return this.orders.createOrder(dto);
  }
  @Get(':orderId/track') @ApiOperation({ summary: 'Track a shipment' }) track(
    @Param('orderId') orderId: string,
  ) {
    return this.orders.trackOrder(orderId);
  }
  @Post(':orderId/cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancel a shipment' })
  cancel(@Param('orderId') orderId: string) {
    return this.orders.cancelOrder(orderId);
  }
}
