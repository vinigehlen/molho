import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { MessagingModule } from '../../messaging/messaging.module';
import { MESSAGING_PROVIDER } from '../../messaging/messaging.module';
import type { MessagingProvider } from '../../messaging/messaging-provider.port';
import { InMemoryCooldown, RedisCooldown } from './cooldown';
import { InMemoryOtpChallengeStore, RedisOtpChallengeStore } from './otp-challenge-store';
import { OtpService } from './otp.service';
import { InMemorySlidingWindowRateLimiter, RedisSlidingWindowRateLimiter } from './rate-limiter';

export const OTP_SERVICE = Symbol('OTP_SERVICE');

@Module({
  imports: [MessagingModule],
  providers: [
    {
      provide: OTP_SERVICE,
      inject: [MESSAGING_PROVIDER],
      useFactory: (messaging: MessagingProvider): OtpService => {
        const hmacKey = process.env.MOLHO_OTP_HMAC_KEY;
        if (!hmacKey) throw new Error('MOLHO_OTP_HMAC_KEY não configurada — ver .env.example');

        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

        return new OtpService({
          messaging,
          challengeStore: redis ? new RedisOtpChallengeStore(redis) : new InMemoryOtpChallengeStore(),
          phoneRateLimiter: redis
            ? new RedisSlidingWindowRateLimiter(redis)
            : new InMemorySlidingWindowRateLimiter(),
          ipRateLimiter: redis
            ? new RedisSlidingWindowRateLimiter(redis)
            : new InMemorySlidingWindowRateLimiter(),
          cooldown: redis ? new RedisCooldown(redis) : new InMemoryCooldown(),
          hmacKey,
        });
      },
    },
  ],
  exports: [OTP_SERVICE],
})
export class OtpModule {}
