import { AsyncLocalStorage } from 'node:async_hooks';
export const requestContext = new AsyncLocalStorage<{ requestId: string }>();
export const currentRequestId = () => requestContext.getStore()?.requestId ?? 'system';
