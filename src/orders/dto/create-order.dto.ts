import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsObject,
  IsOptional,
  IsPositive,
  IsString,
  ValidateNested,
} from 'class-validator';

export class AddressDto {
  @ApiProperty() @IsString() @IsNotEmpty() name!: string;
  @ApiProperty() @IsString() @IsNotEmpty() phone!: string;
  @ApiProperty() @IsString() @IsNotEmpty() address_line1!: string;
  @ApiPropertyOptional() @IsOptional() @IsString() address_line2?: string;
  @ApiProperty() @IsString() @IsNotEmpty() city!: string;
  @ApiProperty() @IsString() @IsNotEmpty() state!: string;
  @ApiProperty() @IsString() @IsNotEmpty() postal_code!: string;
  @ApiProperty() @IsString() @IsNotEmpty() country!: string;
}
export class PackageDto {
  @ApiProperty({ example: 1.5 }) @IsNumber() @IsPositive() weight!: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() length?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() width?: number;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() height?: number;
}
export enum PaymentType {
  PREPAID = 'PREPAID',
  COD = 'COD',
}
export class PaymentDto {
  @ApiProperty({ enum: PaymentType }) @IsEnum(PaymentType) type!: PaymentType;
  @ApiPropertyOptional() @IsOptional() @IsNumber() @IsPositive() amount?: number;
}
export class CreateOrderDto {
  @ApiProperty({ example: 'ORD-1001' }) @IsString() @IsNotEmpty() order_id!: string;
  @ApiProperty({ example: 'mock' }) @IsString() @IsNotEmpty() courier_partner!: string;
  @ApiProperty({ type: AddressDto }) @ValidateNested() @Type(() => AddressDto) pickup!: AddressDto;
  @ApiProperty({ type: AddressDto })
  @ValidateNested()
  @Type(() => AddressDto)
  delivery!: AddressDto;
  @ApiProperty({ type: PackageDto }) @ValidateNested() @Type(() => PackageDto) package!: PackageDto;
  @ApiPropertyOptional({ type: PaymentDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaymentDto)
  payment?: PaymentDto;
  @ApiPropertyOptional() @IsOptional() @IsObject() metadata?: Record<string, unknown>;
}
