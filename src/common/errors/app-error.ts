import { HttpStatus } from '@nestjs/common';
import { ErrorCode } from './error-code';

export class AppError extends Error {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly status = HttpStatus.INTERNAL_SERVER_ERROR,
    public readonly details: unknown = null,
    public readonly rawPayload?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}
