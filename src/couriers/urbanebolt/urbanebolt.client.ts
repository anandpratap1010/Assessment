import { Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios';
import { AppError } from '../../common/errors/app-error';
import { ErrorCode } from '../../common/errors/error-code';
type Token = { value: string; expiresAt: number };
@Injectable()
export class UrbaneBoltClient {
  private readonly http: AxiosInstance;
  private token?: Token;
  private authenticationPromise?: Promise<Token>;
  constructor(private readonly config: ConfigService) {
    this.http = axios.create({
      baseURL: config.get<string>('urbanebolt.baseUrl'),
      timeout: config.get<number>('courier.timeoutMs', 10000),
    });
  }
  protected async authenticate(): Promise<Token> {
    throw new AppError(
      ErrorCode.COURIER_CONFIGURATION_ERROR,
      'UrbaneBolt authentication contract is not configured',
    );
  }
  private async getToken(force = false): Promise<string> {
    if (!force && this.token && this.token.expiresAt > Date.now() + 5000) return this.token.value;
    if (!this.authenticationPromise) {
      this.authenticationPromise = this.authenticate().finally(() => {
        this.authenticationPromise = undefined;
      });
    }
    this.token = await this.authenticationPromise;
    return this.token.value;
  }
  invalidateToken(): void {
    this.token = undefined;
  }
  async executeAuthenticatedRequest<T>(
    request: (token: string) => Promise<AxiosResponse<T>>,
  ): Promise<T> {
    let token = await this.getToken();
    try {
      return (await this.retry(() => request(token))).data;
    } catch (error) {
      if (!this.isUnauthorized(error)) throw this.mapError(error);
      this.invalidateToken();
      token = await this.getToken(true);
      try {
        return (await this.retry(() => request(token))).data;
      } catch (retryError) {
        throw this.mapError(retryError);
      }
    }
  }
  async request<T>(config: AxiosRequestConfig): Promise<T> {
    return this.executeAuthenticatedRequest<T>((token) =>
      this.http.request<T>({
        ...config,
        headers: { ...config.headers, Authorization: `Bearer ${token}` },
      }),
    );
  }
  private async retry<T>(operation: () => Promise<T>): Promise<T> {
    const maxRetries = this.config.get<number>('courier.maxRetries', 3);
    const baseDelay = this.config.get<number>('courier.retryBaseDelayMs', 500);
    let failure: unknown;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        failure = error;
        if (attempt === maxRetries || !this.isTransient(error)) throw error;
        await new Promise((resolve) => setTimeout(resolve, baseDelay * 2 ** attempt));
      }
    }
    throw failure;
  }
  private isUnauthorized(error: unknown): boolean {
    return axios.isAxiosError(error) && error.response?.status === 401;
  }
  private isTransient(error: unknown): boolean {
    if (!axios.isAxiosError(error)) return false;
    return (
      !error.response ||
      error.code === 'ECONNABORTED' ||
      (error.response.status >= 500 && error.response.status <= 599)
    );
  }
  private mapError(error: unknown): AppError {
    if (error instanceof AppError) return error;
    const axiosError = error as AxiosError;
    if (axios.isAxiosError(error)) {
      if (error.code === 'ECONNABORTED')
        return new AppError(
          ErrorCode.COURIER_TIMEOUT,
          'Courier request timed out',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      if (error.response?.status === 401)
        return new AppError(
          ErrorCode.COURIER_AUTH_FAILED,
          'Courier authentication failed',
          HttpStatus.BAD_GATEWAY,
        );
      if (error.response && error.response.status >= 400 && error.response.status < 500)
        return new AppError(
          ErrorCode.COURIER_REQUEST_REJECTED,
          'Courier rejected the request',
          HttpStatus.BAD_GATEWAY,
        );
      return new AppError(
        ErrorCode.COURIER_UNAVAILABLE,
        'Courier is temporarily unavailable',
        HttpStatus.BAD_GATEWAY,
      );
    }
    return new AppError(
      ErrorCode.COURIER_UNAVAILABLE,
      axiosError.message || 'Courier is temporarily unavailable',
      HttpStatus.BAD_GATEWAY,
    );
  }
}
