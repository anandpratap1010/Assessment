export default () => ({
  port: Number(process.env.PORT ?? 3000),
  redis: {
    host: process.env.REDIS_HOST ?? 'localhost',
    port: Number(process.env.REDIS_PORT ?? 6379),
    password: process.env.REDIS_PASSWORD || undefined,
  },
  courier: {
    timeoutMs: Number(process.env.COURIER_TIMEOUT_MS ?? 10000),
    maxRetries: Number(process.env.COURIER_MAX_RETRIES ?? 3),
    retryBaseDelayMs: Number(process.env.COURIER_RETRY_BASE_DELAY_MS ?? 500),
  },
  urbanebolt: {
    baseUrl: process.env.URBANEBOLT_BASE_URL ?? '',
    username: process.env.URBANEBOLT_USERNAME ?? '',
    password: process.env.URBANEBOLT_PASSWORD ?? '',
  },
  bulkWorkerConcurrency: Number(process.env.BULK_WORKER_CONCURRENCY ?? 10),
});
