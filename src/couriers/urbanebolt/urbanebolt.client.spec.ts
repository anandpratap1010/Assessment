import { ConfigService } from '@nestjs/config';
import { UrbaneBoltClient } from './urbanebolt.client';

const axiosError = (status?: number) => ({
  isAxiosError: true,
  message: 'request failed',
  response: status ? { status } : undefined,
});

class TestClient extends UrbaneBoltClient {
  authentications = 0;
  protected async authenticate() {
    this.authentications += 1;
    return { value: `token-${this.authentications}`, expiresAt: Date.now() + 60_000 };
  }
}

describe('UrbaneBoltClient reliability', () => {
  const config = new ConfigService({
    courier: { maxRetries: 2, retryBaseDelayMs: 1, timeoutMs: 10 },
    urbanebolt: { baseUrl: 'https://invalid.test' },
  });

  it('retries transient 5xx failures up to the configured maximum', async () => {
    const client = new TestClient(config);
    const operation = jest
      .fn()
      .mockRejectedValueOnce(axiosError(503))
      .mockRejectedValueOnce(axiosError(500))
      .mockResolvedValue({ data: { ok: true } });
    await expect(client.executeAuthenticatedRequest(operation)).resolves.toEqual({ ok: true });
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('does not retry ordinary 4xx responses', async () => {
    const client = new TestClient(config);
    const operation = jest.fn().mockRejectedValue(axiosError(422));
    await expect(client.executeAuthenticatedRequest(operation)).rejects.toMatchObject({
      code: 'COURIER_REQUEST_REJECTED',
    });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('invalidates authentication and retries the original request once', async () => {
    const client = new TestClient(config);
    const operation = jest
      .fn()
      .mockRejectedValueOnce(axiosError(401))
      .mockResolvedValue({ data: { ok: true } });
    await expect(client.executeAuthenticatedRequest(operation)).resolves.toEqual({ ok: true });
    expect(client.authentications).toBe(2);
    expect(operation).toHaveBeenNthCalledWith(1, 'token-1');
    expect(operation).toHaveBeenNthCalledWith(2, 'token-2');
  });

  it('refreshes authentication only once', async () => {
    const client = new TestClient(config);
    const operation = jest.fn().mockRejectedValue(axiosError(401));
    await expect(client.executeAuthenticatedRequest(operation)).rejects.toMatchObject({
      code: 'COURIER_AUTH_FAILED',
    });
    expect(client.authentications).toBe(2);
    expect(operation).toHaveBeenCalledTimes(2);
  });
});
