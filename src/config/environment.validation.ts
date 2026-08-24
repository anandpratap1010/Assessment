type Env = Record<string, unknown>;
function positiveInt(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0)
    throw new Error(`${name} must be a positive integer`);
  return parsed;
}
function nonNegativeInt(value: unknown, fallback: number, name: string): number {
  const parsed = value === undefined || value === '' ? fallback : Number(value);
  if (!Number.isInteger(parsed) || parsed < 0)
    throw new Error(`${name} must be a non-negative integer`);
  return parsed;
}
export function validateEnvironment(input: Env): Env {
  if (!input.DATABASE_URL) throw new Error('DATABASE_URL is required');
  return {
    ...input,
    NODE_ENV: input.NODE_ENV ?? 'development',
    PORT: positiveInt(input.PORT, 3000, 'PORT'),
    REDIS_HOST: input.REDIS_HOST ?? 'localhost',
    REDIS_PORT: positiveInt(input.REDIS_PORT, 6379, 'REDIS_PORT'),
    COURIER_TIMEOUT_MS: positiveInt(input.COURIER_TIMEOUT_MS, 10000, 'COURIER_TIMEOUT_MS'),
    COURIER_MAX_RETRIES: nonNegativeInt(input.COURIER_MAX_RETRIES, 3, 'COURIER_MAX_RETRIES'),
    COURIER_RETRY_BASE_DELAY_MS: positiveInt(
      input.COURIER_RETRY_BASE_DELAY_MS,
      500,
      'COURIER_RETRY_BASE_DELAY_MS',
    ),
    BULK_WORKER_CONCURRENCY: positiveInt(
      input.BULK_WORKER_CONCURRENCY,
      10,
      'BULK_WORKER_CONCURRENCY',
    ),
  };
}
