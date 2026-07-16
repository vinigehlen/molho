import { createHmac, randomInt } from 'node:crypto';
import { type PhoneNumber, phoneNumberToE164 } from '@molho/contracts';
import { SmsQuotaExceededError } from '../../messaging/messaging-provider.port';
import type { MessagingProvider } from '../../messaging/messaging-provider.port';
import type { Cooldown } from './cooldown';
import { OtpRateLimitedError } from './otp-errors';
import type { OtpChallengeStore } from './otp-challenge-store';
import { ConsoleOtpLogger, type OtpLogger } from './otp-logger';
import type { RateLimiter } from './rate-limiter';

const CODE_TTL_SECONDS = 10 * 60;
const MAX_VERIFY_ATTEMPTS = 3;
const PHONE_LIMIT_PER_HOUR = 5;
const PHONE_LIMIT_WINDOW_SECONDS = 60 * 60;
const IP_LIMIT_PER_HOUR = 20;
const IP_LIMIT_WINDOW_SECONDS = 60 * 60;
const COOLDOWN_SECONDS = 60;

export interface OtpServiceDeps {
  messaging: MessagingProvider;
  challengeStore: OtpChallengeStore;
  phoneRateLimiter: RateLimiter;
  ipRateLimiter: RateLimiter;
  cooldown: Cooldown;
  /** MOLHO_OTP_HMAC_KEY — separada de MOLHO_ENCRYPTION_KEYS (phone), rotação independente. */
  hmacKey: string;
  logger?: OtpLogger;
  buildMessage?: (code: string) => string;
}

/**
 * Login por telefone + OTP — sem senha, sem e-mail. Classe pura, sem
 * decorators do Nest (mesmo padrão de ModuleService/ZenviaSmsProvider):
 * testável sem framework, sem Redis real.
 *
 * NÃO conhece Zenvia nem WhatsApp — só MessagingProvider (porta). Trocar o
 * provider é zero mudança aqui. TAMBÉM não conhece users/customers: cria
 * ou busca a conta é responsabilidade de quem chama verifyOtp() depois que
 * ele devolver true (Épico 3, commit dos controllers) — este serviço só
 * sabe "esse código bate com esse telefone", nada de identidade.
 *
 * Anti-enumeração: requestOtp() nunca consulta se o telefone tem conta —
 * não existe branch nenhum aqui que dependa disso, então a resposta (202,
 * decisão do controller) é estruturalmente idêntica pra telefone que existe
 * ou não.
 */
export class OtpService {
  private readonly messaging: MessagingProvider;
  private readonly challengeStore: OtpChallengeStore;
  private readonly phoneRateLimiter: RateLimiter;
  private readonly ipRateLimiter: RateLimiter;
  private readonly cooldown: Cooldown;
  private readonly hmacKey: string;
  private readonly logger: OtpLogger;
  private readonly buildMessage: (code: string) => string;

  constructor(deps: OtpServiceDeps) {
    this.messaging = deps.messaging;
    this.challengeStore = deps.challengeStore;
    this.phoneRateLimiter = deps.phoneRateLimiter;
    this.ipRateLimiter = deps.ipRateLimiter;
    this.cooldown = deps.cooldown;
    this.hmacKey = deps.hmacKey;
    this.logger = deps.logger ?? new ConsoleOtpLogger();
    this.buildMessage = deps.buildMessage ?? ((code) => `Seu código Molho é ${code}. Vale por 10 minutos.`);
  }

  /**
   * scope namespacea o desafio — "staff" ou "customer:{tenantSlug}" — pra
   * um OTP de login do backoffice nunca ser confundível com o de um cliente
   * de outra loja. O tipo de scope não importa aqui, é opaco de propósito.
   */
  async requestOtp(scope: string, phone: PhoneNumber, ip: string): Promise<void> {
    const phoneHash = this.hashPhone(phone);

    const ipOk = await this.ipRateLimiter.checkAndRecord(
      `otp_rl:ip:${ip}`,
      IP_LIMIT_PER_HOUR,
      IP_LIMIT_WINDOW_SECONDS,
    );
    if (!ipOk) {
      this.log('otp_request', phoneHash, ip, 'rate_limited');
      throw new OtpRateLimitedError('ip');
    }

    const cooldownOk = await this.cooldown.tryAcquire(`otp_cooldown:${scope}:${phoneHash}`, COOLDOWN_SECONDS);
    if (!cooldownOk) {
      this.log('otp_request', phoneHash, ip, 'rate_limited');
      throw new OtpRateLimitedError('cooldown');
    }

    const phoneOk = await this.phoneRateLimiter.checkAndRecord(
      `otp_rl:phone:${scope}:${phoneHash}`,
      PHONE_LIMIT_PER_HOUR,
      PHONE_LIMIT_WINDOW_SECONDS,
    );
    if (!phoneOk) {
      this.log('otp_request', phoneHash, ip, 'rate_limited');
      throw new OtpRateLimitedError('phone');
    }

    const code = this.generateCode();
    await this.challengeStore.create(scope, phoneHash, this.hmac(code), CODE_TTL_SECONDS);

    try {
      await this.messaging.send(phone, this.buildMessage(code));
    } catch (error) {
      if (error instanceof SmsQuotaExceededError) {
        this.log('otp_request', phoneHash, ip, 'quota_exceeded');
      }
      throw error;
    }

    this.log('otp_request', phoneHash, ip, 'success');
  }

  /** true = código certo, desafio consumido (uso único). false = qualquer outro caso. */
  async verifyOtp(scope: string, phone: PhoneNumber, code: string, ip: string): Promise<boolean> {
    const phoneHash = this.hashPhone(phone);
    const challenge = await this.challengeStore.get(scope, phoneHash);

    if (!challenge || challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      this.log('otp_verify', phoneHash, ip, 'invalid_code');
      return false;
    }

    if (this.hmac(code) !== challenge.codeHmac) {
      await this.challengeStore.incrementAttempts(scope, phoneHash);
      this.log('otp_verify', phoneHash, ip, 'invalid_code');
      return false;
    }

    await this.challengeStore.delete(scope, phoneHash);
    this.log('otp_verify', phoneHash, ip, 'success');
    return true;
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }

  private hashPhone(phone: PhoneNumber): string {
    return this.hmac(phoneNumberToE164(phone));
  }

  private log(action: 'otp_request' | 'otp_verify', phoneHash: string, ip: string, result: Parameters<OtpLogger['log']>[0]['result']): void {
    this.logger.log({ action, phoneHash, ip, result });
  }
}
