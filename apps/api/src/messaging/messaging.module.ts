import { Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { InMemoryDailySmsCounter, RedisDailySmsCounter } from './daily-sms-counter';
import type { MessagingProvider } from './messaging-provider.port';
import { MockMessagingProvider } from './mock-messaging.provider';
import { ZenviaSmsProvider } from './zenvia-sms.provider';

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');

const logger = new Logger('MessagingModule');

/**
 * Escolhe o provider pelo ambiente: ZENVIA_API_KEY presente -> Zenvia de
 * verdade; ausente -> Mock (dev local sem credencial). Nunca os dois ao
 * mesmo tempo, nunca fallback de um pro outro em runtime — ver CLAUDE.md
 * regra 6 e a nota de "nega o login, não cai pro Mock" no otp.service.
 */
@Module({
  providers: [
    {
      provide: MESSAGING_PROVIDER,
      useFactory: (): MessagingProvider => {
        const apiKey = process.env.ZENVIA_API_KEY;
        if (!apiKey) {
          logger.warn('ZENVIA_API_KEY ausente — usando MockMessagingProvider (SMS não sai de verdade)');
          return new MockMessagingProvider();
        }

        const counter = process.env.REDIS_URL
          ? new RedisDailySmsCounter(new Redis(process.env.REDIS_URL))
          : new InMemoryDailySmsCounter();

        return new ZenviaSmsProvider({
          apiKey,
          counter,
          maxPerDay: process.env.MOLHO_MAX_SMS_PER_DAY
            ? Number(process.env.MOLHO_MAX_SMS_PER_DAY)
            : undefined,
        });
      },
    },
  ],
  exports: [MESSAGING_PROVIDER],
})
export class MessagingModule {}
