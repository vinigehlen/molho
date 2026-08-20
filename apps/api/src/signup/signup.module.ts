import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import {
  InMemorySlidingWindowRateLimiter,
  type RateLimiter,
  RedisSlidingWindowRateLimiter,
} from '../rate-limit/rate-limiter';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { EMAIL_PROVIDER, MessagingModule } from '../messaging/messaging.module';
import type { EmailProvider } from '../messaging/email-provider.port';
import { InMemoryOtpChallengeStore, RedisOtpChallengeStore } from '../auth/otp/otp-challenge-store';
import type { OtpChallengeStore } from '../auth/otp/otp-challenge-store';
import { TokenModule } from '../auth/token/token.module';
import { SignupController } from './signup.controller';
import { SignupOtpService } from './signup-otp.service';
import { SignupProvisioningService } from './signup-provisioning.service';
import { SIGNUP_OTP_SERVICE, SIGNUP_PROVISIONING_SERVICE, SIGNUP_RATE_LIMITER } from './signup.tokens';

function redisClient(): Redis | null {
  return process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
}

@Module({
  imports: [ContextModule, MessagingModule, TokenModule],
  controllers: [SignupController],
  providers: [
    {
      provide: SIGNUP_RATE_LIMITER,
      useFactory: (): RateLimiter => {
        const redis = redisClient();
        return redis ? new RedisSlidingWindowRateLimiter(redis) : new InMemorySlidingWindowRateLimiter();
      },
    },
    {
      provide: SIGNUP_OTP_SERVICE,
      inject: [SIGNUP_RATE_LIMITER, EMAIL_PROVIDER],
      useFactory: (rateLimiter: RateLimiter, emailProvider: EmailProvider): SignupOtpService => {
        const redis = redisClient();
        const challengeStore: OtpChallengeStore = redis
          ? new RedisOtpChallengeStore(redis)
          : new InMemoryOtpChallengeStore();
        return new SignupOtpService(
          challengeStore,
          rateLimiter,
          emailProvider,
          process.env.MOLHO_OTP_HMAC_KEY ?? 'dev-only-otp-hmac-key',
        );
      },
    },
    {
      provide: SIGNUP_PROVISIONING_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): SignupProvisioningService =>
        new SignupProvisioningService(requestContext),
    },
  ],
})
export class SignupModule {}
