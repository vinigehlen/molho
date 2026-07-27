import { describe, expect, it } from 'vitest';
import { MockMessagingProvider } from './mock-messaging.provider';
import { selectMessagingProvider } from './messaging.module';
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
});
