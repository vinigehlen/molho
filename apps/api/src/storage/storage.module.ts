import { Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import {
  InMemorySlidingWindowRateLimiter,
  type RateLimiter,
  RedisSlidingWindowRateLimiter,
} from '../auth/otp/rate-limiter';
import { MockStorageProvider } from './mock-storage.provider';
import { R2StorageProvider } from './r2-storage.provider';
import type { StorageProvider } from './storage-provider.port';

export const STORAGE_PROVIDER = Symbol('STORAGE_PROVIDER');
/** Sliding window genérico (mesma classe do rate limit de OTP) — 30 URLs de upload/hora por (tenant+user). */
export const UPLOAD_URL_RATE_LIMITER = Symbol('UPLOAD_URL_RATE_LIMITER');

const logger = new Logger('StorageModule');

/**
 * Escolhe o provider pelo ambiente: S3_ACCESS_KEY_ID presente -> R2 de
 * verdade; ausente -> Mock (dev local sem credencial) — mesmo padrão de
 * MessagingModule (ZENVIA_API_KEY). Nunca fallback de um pro outro em
 * runtime.
 */
@Module({
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useFactory: (): StorageProvider => {
        const accessKeyId = process.env.S3_ACCESS_KEY_ID;
        if (!accessKeyId) {
          logger.warn('S3_ACCESS_KEY_ID ausente — usando MockStorageProvider (upload não sobe de verdade)');
          return new MockStorageProvider();
        }

        return new R2StorageProvider({
          endpoint: process.env.S3_ENDPOINT ?? '',
          region: process.env.S3_REGION ?? 'auto',
          bucket: process.env.S3_BUCKET ?? '',
          accessKeyId,
          secretAccessKey: process.env.S3_SECRET_ACCESS_KEY ?? '',
        });
      },
    },
    {
      provide: UPLOAD_URL_RATE_LIMITER,
      useFactory: (): RateLimiter => {
        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
        return redis ? new RedisSlidingWindowRateLimiter(redis) : new InMemorySlidingWindowRateLimiter();
      },
    },
  ],
  exports: [STORAGE_PROVIDER, UPLOAD_URL_RATE_LIMITER],
})
export class StorageModule {}
