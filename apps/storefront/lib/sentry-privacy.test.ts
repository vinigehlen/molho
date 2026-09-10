import { describe, expect, it } from 'vitest';
import { scrubSentryEvent } from '../../sentry-privacy';

describe('scrubbing dos fronts', () => {
  it('remove PII, cookies, tokens e query sem apagar contexto operacional', () => {
    const event = scrubSentryEvent({
      message: 'Falha para maria@example.com no telefone (51) 99999-1234',
      request: {
        url: 'https://cabanhas-bbq.molho.live/acompanhar/token-secreto?phone=51999991234',
        headers: { cookie: 'session=abc', authorization: 'Bearer abc.def.ghi' },
        data: { address: 'Rua Um', totalCents: 4200 },
      },
      tags: { route: 'checkout', tenantSlug: 'cabanhas-bbq' },
    });

    expect(event.message).toBe('Falha para [email] no telefone [phone]');
    expect(event.request.url).toBe('https://cabanhas-bbq.molho.live/acompanhar/[token]');
    expect(event.request.headers.cookie).toBe('[redacted]');
    expect(event.request.headers.authorization).toBe('[redacted]');
    expect(event.request.data).toBe('[redacted]');
    expect(event.tags).toEqual({ route: 'checkout', tenantSlug: 'cabanhas-bbq' });
  });
});
