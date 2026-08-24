import { Injectable, NestMiddleware } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { requestContext } from '../request-context';

@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    const supplied = req.header('x-request-id');
    const requestId = supplied?.trim().slice(0, 128) || randomUUID();
    res.setHeader('X-Request-ID', requestId);
    requestContext.run({ requestId }, next);
  }
}
