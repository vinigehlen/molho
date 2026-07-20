import { type PhoneNumber, parsePhoneNumber } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import { SmsQuotaExceededError } from '../../messaging/messaging-provider.port';
import { InMemoryCooldown } from './cooldown';
import { InMemoryOtpChallengeStore } from './otp-challenge-store';
import { OtpRateLimitedError } from './otp-errors';
import { OtpService } from './otp.service';
import { InMemorySlidingWindowRateLimiter } from '../../rate-limit/rate-limiter';

const PHONE_A = parsePhoneNumber('+5551999990000');
const PHONE_B = parsePhoneNumber('+5551988880000');
const IP = '203.0.113.10';
const HMAC_KEY = 'chave-de-teste-nao-usar-em-producao';

class FakeMessagingProvider {
  sent: Array<{ to: string; message: string }> = [];
  throwQuotaExceeded = false;

  async send(to: PhoneNumber, message: string): Promise<void> {
    if (this.throwQuotaExceeded) throw new SmsQuotaExceededError(501, 500);
    this.sent.push({ to, message });
  }
}

/** Um "relógio" compartilhado entre challengeStore/rateLimiter/cooldown, pra
 * poder avançar o tempo de propósito nos testes de expiração/cooldown. */
function makeClock(startMs = 0) {
  let now = startMs;
  return { now: () => now, advance: (ms: number) => (now += ms) };
}

function setup(overrides: { clock?: ReturnType<typeof makeClock> } = {}) {
  const clock = overrides.clock ?? makeClock();
  const messaging = new FakeMessagingProvider();
  const service = new OtpService({
    messaging,
    challengeStore: new InMemoryOtpChallengeStore(clock.now),
    phoneRateLimiter: new InMemorySlidingWindowRateLimiter(clock.now),
    ipRateLimiter: new InMemorySlidingWindowRateLimiter(clock.now),
    cooldown: new InMemoryCooldown(clock.now),
    hmacKey: HMAC_KEY,
    logger: { log: vi.fn() },
  });
  return { service, messaging, clock };
}

function extractCode(message: string): string {
  const match = message.match(/\d{6}/);
  if (!match) throw new Error(`sem código de 6 dígitos em "${message}"`);
  return match[0];
}

describe('OtpService.requestOtp', () => {
  it('caminho feliz: manda o código via MessagingProvider', async () => {
    const { service, messaging } = setup();
    await service.requestOtp('staff', PHONE_A, IP);

    expect(messaging.sent).toHaveLength(1);
    expect(messaging.sent[0]?.to).toBe(PHONE_A);
    expect(extractCode(messaging.sent[0]?.message ?? '')).toMatch(/^\d{6}$/);
  });

  it('cooldown: 2º pedido do mesmo telefone antes de 60s é bloqueado', async () => {
    const { service, clock } = setup();
    await service.requestOtp('staff', PHONE_A, IP);

    await expect(service.requestOtp('staff', PHONE_A, IP)).rejects.toBeInstanceOf(OtpRateLimitedError);
    await expect(service.requestOtp('staff', PHONE_A, IP)).rejects.toMatchObject({
      kind: 'cooldown',
    });

    clock.advance(60_001);
    await expect(service.requestOtp('staff', PHONE_A, IP)).resolves.toBeUndefined();
  });

  it('rate limit por telefone: 6º pedido na mesma hora é bloqueado (limite é 5)', async () => {
    const { service, clock } = setup();
    for (let i = 0; i < 5; i++) {
      await service.requestOtp('staff', PHONE_A, IP);
      clock.advance(COOLDOWN_MS_JUST_OVER());
    }

    await expect(service.requestOtp('staff', PHONE_A, IP)).rejects.toMatchObject({ kind: 'phone' });
  });

  it('rate limit por IP: 21º pedido na mesma hora, telefones diferentes, é bloqueado (limite é 20)', async () => {
    const { service, clock } = setup();
    // usa telefones/scopes diferentes a cada pedido pra não esbarrar no
    // limite de telefone (5/h) nem no cooldown antes do de IP (20/h) bater.
    for (let i = 0; i < 20; i++) {
      const phone = i % 2 === 0 ? PHONE_A : PHONE_B;
      await service.requestOtp(`scope-${i}`, phone, IP);
      clock.advance(1000);
    }

    await expect(service.requestOtp('scope-novo', PHONE_A, IP)).rejects.toMatchObject({ kind: 'ip' });
  });

  it('rate limit de telefone e de IP são independentes: estourar um não afeta o outro', async () => {
    const { service, clock } = setup();
    // Estoura o limite de TELEFONE de A (5/h), do mesmo IP.
    for (let i = 0; i < 5; i++) {
      await service.requestOtp('staff', PHONE_A, IP);
      clock.advance(COOLDOWN_MS_JUST_OVER());
    }
    await expect(service.requestOtp('staff', PHONE_A, IP)).rejects.toMatchObject({ kind: 'phone' });

    // B, mesmo IP, ainda funciona — o limite de A não vazou pro de B.
    await expect(service.requestOtp('staff', PHONE_B, IP)).resolves.toBeUndefined();
  });

  it('quota diária do Zenvia estourada: propaga SmsQuotaExceededError, não vira OtpRateLimitedError', async () => {
    const { service, messaging } = setup();
    messaging.throwQuotaExceeded = true;

    await expect(service.requestOtp('staff', PHONE_A, IP)).rejects.toBeInstanceOf(SmsQuotaExceededError);
  });
});

describe('OtpService.verifyOtp', () => {
  it('código certo na 1ª tentativa: verifica e consome (uso único)', async () => {
    const { service, messaging } = setup();
    await service.requestOtp('staff', PHONE_A, IP);
    const code = extractCode(messaging.sent[0]?.message ?? '');

    expect(await service.verifyOtp('staff', PHONE_A, code, IP)).toBe(true);
    // 2ª tentativa com o MESMO código, já consumido: falha.
    expect(await service.verifyOtp('staff', PHONE_A, code, IP)).toBe(false);
  });

  it('brute force: 3 tentativas erradas bloqueiam a 4ª mesmo com o código certo', async () => {
    const { service, messaging } = setup();
    await service.requestOtp('staff', PHONE_A, IP);
    const code = extractCode(messaging.sent[0]?.message ?? '');

    expect(await service.verifyOtp('staff', PHONE_A, '000000', IP)).toBe(false);
    expect(await service.verifyOtp('staff', PHONE_A, '000001', IP)).toBe(false);
    expect(await service.verifyOtp('staff', PHONE_A, '000002', IP)).toBe(false);
    // 3 erradas já eram o limite — a 4ª tentativa nem com o código certo passa.
    expect(await service.verifyOtp('staff', PHONE_A, code, IP)).toBe(false);
  });

  it('código expirado depois de 10 minutos: verify falha mesmo com o código certo', async () => {
    const { service, messaging, clock } = setup();
    await service.requestOtp('staff', PHONE_A, IP);
    const code = extractCode(messaging.sent[0]?.message ?? '');

    clock.advance(10 * 60 * 1000 + 1);

    expect(await service.verifyOtp('staff', PHONE_A, code, IP)).toBe(false);
  });

  it('telefone sem nenhum pedido de OTP: verify falha (não existe desafio)', async () => {
    const { service } = setup();
    expect(await service.verifyOtp('staff', PHONE_A, '123456', IP)).toBe(false);
  });

  it('scopes diferentes não compartilham o mesmo desafio (staff vs customer)', async () => {
    const { service, messaging } = setup();
    await service.requestOtp('staff', PHONE_A, IP);
    const code = extractCode(messaging.sent[0]?.message ?? '');

    expect(await service.verifyOtp('customer:pizzaria-roma', PHONE_A, code, IP)).toBe(false);
    expect(await service.verifyOtp('staff', PHONE_A, code, IP)).toBe(true);
  });
});

// Cooldown é 60s — avança um pouco mais pra garantir que passou a janela.
function COOLDOWN_MS_JUST_OVER(): number {
  return 60_001;
}
