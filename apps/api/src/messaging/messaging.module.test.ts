import { describe, expect, it } from 'vitest';
import { MockEmailProvider } from './mock-email.provider';
import { MockMessagingProvider } from './mock-messaging.provider';
import { selectEmailProvider, selectMessagingProvider } from './messaging.module';
import { ResendEmailProvider } from './resend-email.provider';
import { ZenviaSmsProvider } from './zenvia-sms.provider';

/**
 * Guarda de superfície de auth: sem provider real em produção, o Mock (que loga
 * o código OTP) viraria bypass de login. A seleção tem que FALHAR barulhenta,
 * nunca degradar pro Mock em produção.
 */
describe('selectMessagingProvider', () => {
  it('produção sem ZENVIA_API_KEY: LANÇA (nunca cai pro Mock)', () => {
    expect(() => selectMessagingProvider({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toThrow(/bypass de auth/);
  });

  it('fora de produção sem ZENVIA_API_KEY: Mock (dev local)', () => {
    expect(selectMessagingProvider({ NODE_ENV: 'development' } as NodeJS.ProcessEnv)).toBeInstanceOf(MockMessagingProvider);
  });

  it('com ZENVIA_API_KEY: provider real, mesmo em produção', () => {
    const p = selectMessagingProvider({ NODE_ENV: 'production', ZENVIA_API_KEY: 'x' } as NodeJS.ProcessEnv);
    expect(p).toBeInstanceOf(ZenviaSmsProvider);
  });

  it('produção com TODO escopo em e-mail: SMS não bloqueia o boot (guarda por canal EM USO)', () => {
    const p = selectMessagingProvider({
      NODE_ENV: 'production',
      OTP_CHANNEL_STAFF: 'email',
      OTP_CHANNEL_CUSTOMER: 'email',
    } as NodeJS.ProcessEnv);
    expect(p).toBeInstanceOf(MockMessagingProvider);
  });

  it('produção com UM escopo ainda em SMS: volta a exigir a chave', () => {
    expect(() =>
      selectMessagingProvider({
        NODE_ENV: 'production',
        OTP_CHANNEL_STAFF: 'email',
        OTP_CHANNEL_CUSTOMER: 'sms',
      } as NodeJS.ProcessEnv),
    ).toThrow(/bypass de auth/);
  });
});

describe('selectEmailProvider', () => {
  it('produção com OTP por e-mail e sem RESEND_API_KEY: LANÇA', () => {
    expect(() =>
      selectEmailProvider({
        NODE_ENV: 'production',
        OTP_CHANNEL_STAFF: 'email',
        MOLHO_EMAIL_FROM: 'Molho <login@send.molho.live>',
      } as NodeJS.ProcessEnv),
    ).toThrow(/bypass de auth/);
  });

  it('produção com OTP por e-mail e sem MOLHO_EMAIL_FROM: LANÇA (remetente errado só falha na entrega)', () => {
    expect(() =>
      selectEmailProvider({
        NODE_ENV: 'production',
        OTP_CHANNEL_STAFF: 'email',
        RESEND_API_KEY: 'x',
      } as NodeJS.ProcessEnv),
    ).toThrow(/bypass de auth/);
  });

  it('produção com tudo em SMS: e-mail não bloqueia o boot', () => {
    expect(selectEmailProvider({ NODE_ENV: 'production' } as NodeJS.ProcessEnv)).toBeInstanceOf(MockEmailProvider);
  });

  it('fora de produção sem chave: Mock (dev local)', () => {
    expect(
      selectEmailProvider({ NODE_ENV: 'development', OTP_CHANNEL_STAFF: 'email' } as NodeJS.ProcessEnv),
    ).toBeInstanceOf(MockEmailProvider);
  });

  it('com chave + remetente: Resend real', () => {
    const p = selectEmailProvider({
      NODE_ENV: 'production',
      OTP_CHANNEL_STAFF: 'email',
      RESEND_API_KEY: 'x',
      MOLHO_EMAIL_FROM: 'Molho <login@send.molho.live>',
    } as NodeJS.ProcessEnv);
    expect(p).toBeInstanceOf(ResendEmailProvider);
  });
});
