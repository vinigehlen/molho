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
 *
 * GUARDA DE PRODUÇÃO (superfície de auth): sem ZENVIA_API_KEY em produção,
 * NÃO cai pro Mock — o MockMessagingProvider LOGA o código OTP em texto, então
 * subir com ele em produção transforma o OTP em BYPASS de autenticação
 * (qualquer um com acesso ao log entra). Falha barulhenta no boot, mesmo padrão
 * do stub `dev-only-auth` (explode em vez de degradar). Pura e exportada pra
 * ser testável (o factory do Nest só chama isto).
 */
export function selectMessagingProvider(env: NodeJS.ProcessEnv = process.env): MessagingProvider {
  const apiKey = env.ZENVIA_API_KEY;
  if (!apiKey) {
    if (env.NODE_ENV === 'production') {
      throw new Error(
        'ZENVIA_API_KEY ausente em produção — recusando subir com MockMessagingProvider (o OTP mock loga o código = bypass de auth). Configure o provider real de SMS.',
      );
    }
    logger.warn('ZENVIA_API_KEY ausente — usando MockMessagingProvider (SMS não sai de verdade). Só fora de produção.');
    return new MockMessagingProvider();
  }

  const counter = env.REDIS_URL ? new RedisDailySmsCounter(new Redis(env.REDIS_URL)) : new InMemoryDailySmsCounter();

  return new ZenviaSmsProvider({
    apiKey,
    counter,
    maxPerDay: env.MOLHO_MAX_SMS_PER_DAY ? Number(env.MOLHO_MAX_SMS_PER_DAY) : undefined,
  });
}

@Module({
  providers: [
    {
      provide: MESSAGING_PROVIDER,
      useFactory: (): MessagingProvider => selectMessagingProvider(),
    },
  ],
  exports: [MESSAGING_PROVIDER],
})
export class MessagingModule {}
