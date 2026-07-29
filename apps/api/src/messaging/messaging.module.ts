import { Logger, Module } from '@nestjs/common';
import Redis from 'ioredis';
import { InMemoryDailySmsCounter, RedisDailySmsCounter } from './daily-sms-counter';
import type { EmailProvider } from './email-provider.port';
import type { MessagingProvider } from './messaging-provider.port';
import { MockEmailProvider } from './mock-email.provider';
import { MockMessagingProvider } from './mock-messaging.provider';
import { isOtpChannelInUse } from './otp-channel';
import { ResendEmailProvider } from './resend-email.provider';
import { ZenviaSmsProvider } from './zenvia-sms.provider';

export const MESSAGING_PROVIDER = Symbol('MESSAGING_PROVIDER');
export const EMAIL_PROVIDER = Symbol('EMAIL_PROVIDER');

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
 *
 * A guarda é POR CANAL EM USO (Épico 9c): se nenhum escopo está em `sms`, o
 * SMS não bloqueia o boot — o piloto sobe só com e-mail, sem credencial da
 * Zenvia. O que NUNCA acontece é canal em uso caindo pro mock em produção.
 */
export function selectMessagingProvider(env: NodeJS.ProcessEnv = process.env): MessagingProvider {
  const apiKey = env.ZENVIA_API_KEY;
  if (!apiKey) {
    if (env.NODE_ENV === 'production' && isOtpChannelInUse('sms', env)) {
      throw new Error(
        'ZENVIA_API_KEY ausente em produção com OTP por SMS — recusando subir com MockMessagingProvider (o OTP mock loga o código = bypass de auth). Configure o provider real de SMS ou mude OTP_CHANNEL_* pra "email".',
      );
    }
    logger.warn('ZENVIA_API_KEY ausente — usando MockMessagingProvider (SMS não sai de verdade). Só fora de produção ou com o canal SMS desligado.');
    return new MockMessagingProvider();
  }

  const counter = env.REDIS_URL ? new RedisDailySmsCounter(new Redis(env.REDIS_URL)) : new InMemoryDailySmsCounter();

  return new ZenviaSmsProvider({
    apiKey,
    counter,
    maxPerDay: env.MOLHO_MAX_SMS_PER_DAY ? Number(env.MOLHO_MAX_SMS_PER_DAY) : undefined,
  });
}

/**
 * Mesma guarda do SMS, do outro lado do canal: RESEND_API_KEY presente ->
 * Resend de verdade; ausente -> Mock. Em produção COM algum escopo em
 * `email`, ausência de chave (ou de remetente) recusa o boot — o
 * MockEmailProvider também loga o código.
 *
 * MOLHO_EMAIL_FROM é exigido junto porque um remetente errado não falha no
 * boot: falha silenciosamente na ENTREGA (SPF/DKIM do send.molho.live, ver
 * docs/08), que é o modo de falha caro — o lojista não loga e ninguém sabe por quê.
 */
export function selectEmailProvider(env: NodeJS.ProcessEnv = process.env): EmailProvider {
  const apiKey = env.RESEND_API_KEY;
  const from = env.MOLHO_EMAIL_FROM;
  if (!apiKey || !from) {
    if (env.NODE_ENV === 'production' && isOtpChannelInUse('email', env)) {
      throw new Error(
        'RESEND_API_KEY/MOLHO_EMAIL_FROM ausente em produção com OTP por e-mail — recusando subir com MockEmailProvider (o OTP mock loga o código = bypass de auth). Configure o provider real de e-mail.',
      );
    }
    logger.warn('RESEND_API_KEY/MOLHO_EMAIL_FROM ausente — usando MockEmailProvider (e-mail não sai de verdade). Só fora de produção ou com o canal e-mail desligado.');
    return new MockEmailProvider();
  }

  return new ResendEmailProvider({ apiKey, from });
}

@Module({
  providers: [
    {
      provide: MESSAGING_PROVIDER,
      useFactory: (): MessagingProvider => selectMessagingProvider(),
    },
    {
      provide: EMAIL_PROVIDER,
      useFactory: (): EmailProvider => selectEmailProvider(),
    },
  ],
  exports: [MESSAGING_PROVIDER, EMAIL_PROVIDER],
})
export class MessagingModule {}
