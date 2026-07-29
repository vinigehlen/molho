import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import { InMemoryCooldown, RedisCooldown } from './cooldown';
import { InMemoryOtpChallengeStore, RedisOtpChallengeStore } from './otp-challenge-store';
import { OtpService } from './otp.service';
import { InMemorySlidingWindowRateLimiter, RedisSlidingWindowRateLimiter } from '../../rate-limit/rate-limiter';

export const OTP_SERVICE = Symbol('OTP_SERVICE');

// OtpService é AGNÓSTICO de canal (só conhece OtpRecipient) — a entrega é montada
// por quem chama (controllers). O provider de entrega (SMS/e-mail) NÃO é injetado
// aqui; os controllers montam o recipiente com o provider certo.
@Module({
  providers: [
    {
      provide: OTP_SERVICE,
      useFactory: (): OtpService => {
        const hmacKey = process.env.MOLHO_OTP_HMAC_KEY;
        if (!hmacKey) throw new Error('MOLHO_OTP_HMAC_KEY não configurada — ver .env.example');

        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;

        return new OtpService({
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
