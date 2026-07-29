import { describe, expect, it, vi } from 'vitest';
import { parseEmail } from '@molho/contracts';
import { ResendEmailProvider } from './resend-email.provider';

const to = parseEmail('ana@loja.com');

function providerWith(response: Response) {
  const fetchImpl = vi.fn().mockResolvedValue(response);
  return {
    fetchImpl,
    provider: new ResendEmailProvider({
      apiKey: 'chave',
      from: 'Molho <login@send.molho.live>',
      fetchImpl: fetchImpl as unknown as typeof fetch,
    }),
  };
}

describe('ResendEmailProvider', () => {
  it('POSTa from/to/subject/text com Bearer', async () => {
    const { fetchImpl, provider } = providerWith(new Response('{}', { status: 200 }));

    await provider.send(to, 'Seu código', 'Seu código Molho é 123456.');

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer chave');
    expect(JSON.parse(init.body as string)).toEqual({
      from: 'Molho <login@send.molho.live>',
      to: ['ana@loja.com'],
      subject: 'Seu código',
      text: 'Seu código Molho é 123456.',
    });
  });

  it('resposta de erro LANÇA (não engole — sem código entregue, sem login)', async () => {
    const { provider } = providerWith(new Response('daily limit', { status: 429 }));
    await expect(provider.send(to, 'x', 'y')).rejects.toThrow(/Resend respondeu 429/);
  });
});
