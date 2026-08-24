import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Response } from 'express';
import { AppError } from '../errors/app-error';
import { ErrorCode } from '../errors/error-code';
import { currentRequestId } from '../request-context';

@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(ApiExceptionFilter.name);
  catch(error: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();
    const requestId = currentRequestId();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrorCode.INTERNAL_ERROR;
    let message = 'Internal server error';
    let details: unknown = null;
    if (error instanceof AppError) {
      status = error.status;
      code = error.code;
      message = error.message;
      details = error.details;
    } else if (error instanceof HttpException) {
      status = error.getStatus();
      const body = error.getResponse() as any;
      if (status === 400) {
        code = ErrorCode.VALIDATION_ERROR;
        message = 'Request validation failed';
        details = Array.isArray(body?.message) ? body.message : body;
      } else {
        message = typeof body === 'string' ? body : (body?.message ?? message);
      }
    }
    if (status >= 500)
      this.logger.error(
        JSON.stringify({
          requestId,
          errorCode: code,
          errorType: error instanceof Error ? error.name : typeof error,
          message: error instanceof Error ? error.message : message,
          stack: error instanceof Error ? error.stack : undefined,
        }),
      );
    response
      .status(status)
      .json({ success: false, error: { code, message, details }, request_id: requestId });
  }
}
