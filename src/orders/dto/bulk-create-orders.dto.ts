import { ApiProperty } from '@nestjs/swagger';
import { ArrayMaxSize, ArrayMinSize, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { CreateOrderDto } from './create-order.dto';
export class BulkCreateOrdersDto {
  @ApiProperty({ type: [CreateOrderDto] })
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderDto)
  orders!: CreateOrderDto[];
}
