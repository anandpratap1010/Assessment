import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { currentRequestId } from '../request-context';
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next
      .handle()
      .pipe(map((data) => ({ success: true, data, request_id: currentRequestId() })));
  }
}
