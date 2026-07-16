import { parsePhoneNumber } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import { InMemoryDailySmsCounter } from './daily-sms-counter';
import { SmsQuotaExceededError } from './messaging-provider.port';
import { ZenviaSmsProvider } from './zenvia-sms.provider';

const PHONE = parsePhoneNumber('+5551999990000');

function okFetch() {
  return vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '' });
}

describe('ZenviaSmsProvider', () => {
  it('manda POST pra Zenvia com telefone em E.164 e a mensagem', async () => {
    const fetchImpl = okFetch();
    const provider = new ZenviaSmsProvider({
      apiKey: 'chave-de-teste',
      counter: new InMemoryDailySmsCounter(),
      fetchImpl,
    });

    await provider.send(PHONE, 'seu código é 123456');

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const call = fetchImpl.mock.calls[0];
    if (!call) throw new Error('fetchImpl não foi chamado');
    const [url, init] = call;
    expect(url).toContain('zenvia.com');
    expect(init.headers['X-API-TOKEN']).toBe('chave-de-teste');
    const body = JSON.parse(init.body);
    expect(body.to).toBe('+5551999990000');
    expect(body.contents[0].text).toBe('seu código é 123456');
  });

  it('resposta não-ok da Zenvia vira erro com status e corpo', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 401, text: async () => 'unauthorized' });
    const provider = new ZenviaSmsProvider({
      apiKey: 'chave-invalida',
      counter: new InMemoryDailySmsCounter(),
      fetchImpl,
    });

    await expect(provider.send(PHONE, 'x')).rejects.toThrow(/401/);
  });

  it('teto diário excedido: lança SmsQuotaExceededError e NUNCA chama a Zenvia', async () => {
    const fetchImpl = okFetch();
    const counter = { incrementAndGet: vi.fn().mockResolvedValue(501) };
    const critical = vi.fn();
    const provider = new ZenviaSmsProvider({
      apiKey: 'chave',
      counter,
      maxPerDay: 500,
      fetchImpl,
      logger: { critical },
    });

    await expect(provider.send(PHONE, 'x')).rejects.toBeInstanceOf(SmsQuotaExceededError);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(critical).toHaveBeenCalledWith(expect.stringContaining('501/500'));
  });

  it('exatamente no teto (count === maxPerDay) ainda passa — só o que EXCEDE bloqueia', async () => {
    const fetchImpl = okFetch();
    const counter = { incrementAndGet: vi.fn().mockResolvedValue(500) };
    const provider = new ZenviaSmsProvider({ apiKey: 'chave', counter, maxPerDay: 500, fetchImpl });

    await expect(provider.send(PHONE, 'x')).resolves.toBeUndefined();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('usa o teto default (500) quando maxPerDay não é passado', async () => {
    const fetchImpl = okFetch();
    const counter = { incrementAndGet: vi.fn().mockResolvedValue(501) };
    const provider = new ZenviaSmsProvider({ apiKey: 'chave', counter, fetchImpl });

    const error = await provider.send(PHONE, 'x').catch((e) => e);
    expect(error).toBeInstanceOf(SmsQuotaExceededError);
    expect((error as InstanceType<typeof SmsQuotaExceededError>).limit).toBe(500);
  });
});
