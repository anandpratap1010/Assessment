import { Inject, Injectable, HttpStatus } from '@nestjs/common';
import { AppError } from '../common/errors/app-error';
import { ErrorCode } from '../common/errors/error-code';
import { COURIER_ADAPTERS, CourierAdapter } from './courier-adapter.interface';
@Injectable()
export class CourierRegistry {
  private readonly adapters: Map<string, CourierAdapter>;
  constructor(@Inject(COURIER_ADAPTERS) adapters: CourierAdapter[]) {
    this.adapters = new Map(adapters.map((adapter) => [adapter.partner.toLowerCase(), adapter]));
  }
  get(partner: string): CourierAdapter {
    const adapter = this.adapters.get(partner.trim().toLowerCase());
    if (!adapter)
      throw new AppError(
        ErrorCode.UNKNOWN_COURIER,
        'Unsupported courier partner',
        HttpStatus.BAD_REQUEST,
        { supported_couriers: this.supported() },
      );
    return adapter;
  }
  supported(): string[] {
    return [...this.adapters.keys()].sort();
  }
}
