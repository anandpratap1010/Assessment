import { validateEnvironment } from './environment.validation';

describe('validateEnvironment', () => {
  it('applies defaults and permits disabling courier retries', () => {
    expect(
      validateEnvironment({ DATABASE_URL: 'postgresql://localhost/test', COURIER_MAX_RETRIES: 0 }),
    ).toMatchObject({ PORT: 3000, REDIS_PORT: 6379, COURIER_MAX_RETRIES: 0 });
  });

  it('requires a database URL', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL is required');
  });

  it('rejects invalid worker concurrency', () => {
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'postgresql://localhost/test',
        BULK_WORKER_CONCURRENCY: 0,
      }),
    ).toThrow('BULK_WORKER_CONCURRENCY must be a positive integer');
  });
});
