import { createHmac, randomInt } from 'node:crypto';
import { SmsQuotaExceededError } from '../../messaging/messaging-provider.port';
import type { Cooldown } from './cooldown';
import { OtpRateLimitedError } from './otp-errors';
import type { OtpChallengeStore } from './otp-challenge-store';
import { ConsoleOtpLogger, type OtpLogger } from './otp-logger';
import type { OtpRecipient } from './otp-recipient';
import type { RateLimiter } from '../../rate-limit/rate-limiter';

const CODE_TTL_SECONDS = 10 * 60;
const MAX_VERIFY_ATTEMPTS = 3;
const PHONE_LIMIT_PER_HOUR = 5;
const PHONE_LIMIT_WINDOW_SECONDS = 60 * 60;
const IP_LIMIT_PER_HOUR = 20;
const IP_LIMIT_WINDOW_SECONDS = 60 * 60;
const COOLDOWN_SECONDS = 60;

export interface OtpServiceDeps {
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
 * NÃO conhece canal (SMS/e-mail) nem provider — só o `OtpRecipient` (identifier
 * pra keying + deliver). Trocar/adicionar canal é zero mudança aqui: quem chama
 * monta o recipiente. TAMBÉM não conhece users/customers: cria
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
  private readonly challengeStore: OtpChallengeStore;
  private readonly phoneRateLimiter: RateLimiter;
  private readonly ipRateLimiter: RateLimiter;
  private readonly cooldown: Cooldown;
  private readonly hmacKey: string;
  private readonly logger: OtpLogger;
  private readonly buildMessage: (code: string) => string;

  constructor(deps: OtpServiceDeps) {
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
  async requestOtp(scope: string, recipient: OtpRecipient, ip: string): Promise<void> {
    // idHash = hmac(identifier). Pra telefone, identifier = E.164 → hash IDÊNTICO
    // ao antigo hashPhone (chave de desafio e rate limit inalteradas). As chaves
    // Redis mantêm o prefixo `otp_rl:phone:`/`otp_cooldown:` (namespace histórico).
    const idHash = this.hmac(recipient.identifier);

    const ipOk = await this.ipRateLimiter.checkAndRecord(
      `otp_rl:ip:${ip}`,
      IP_LIMIT_PER_HOUR,
      IP_LIMIT_WINDOW_SECONDS,
    );
    if (!ipOk) {
      this.log('otp_request', idHash, ip, 'rate_limited');
      throw new OtpRateLimitedError('ip');
    }

    const cooldownOk = await this.cooldown.tryAcquire(`otp_cooldown:${scope}:${idHash}`, COOLDOWN_SECONDS);
    if (!cooldownOk) {
      this.log('otp_request', idHash, ip, 'rate_limited');
      throw new OtpRateLimitedError('cooldown');
    }

    const phoneOk = await this.phoneRateLimiter.checkAndRecord(
      `otp_rl:phone:${scope}:${idHash}`,
      PHONE_LIMIT_PER_HOUR,
      PHONE_LIMIT_WINDOW_SECONDS,
    );
    if (!phoneOk) {
      this.log('otp_request', idHash, ip, 'rate_limited');
      throw new OtpRateLimitedError('phone');
    }

    const code = this.generateCode();
    await this.challengeStore.create(scope, idHash, this.hmac(code), CODE_TTL_SECONDS);

    try {
      await recipient.deliver(this.buildMessage(code));
    } catch (error) {
      if (error instanceof SmsQuotaExceededError) {
        this.log('otp_request', idHash, ip, 'quota_exceeded');
      }
      throw error;
    }

    this.log('otp_request', idHash, ip, 'success');
  }

  /** true = código certo, desafio consumido (uso único). false = qualquer outro caso. */
  async verifyOtp(scope: string, recipient: OtpRecipient, code: string, ip: string): Promise<boolean> {
    const idHash = this.hmac(recipient.identifier);
    const challenge = await this.challengeStore.get(scope, idHash);

    if (!challenge || challenge.attempts >= MAX_VERIFY_ATTEMPTS) {
      this.log('otp_verify', idHash, ip, 'invalid_code');
      return false;
    }

    if (this.hmac(code) !== challenge.codeHmac) {
      await this.challengeStore.incrementAttempts(scope, idHash);
      this.log('otp_verify', idHash, ip, 'invalid_code');
      return false;
    }

    await this.challengeStore.delete(scope, idHash);
    this.log('otp_verify', idHash, ip, 'success');
    return true;
  }

  private generateCode(): string {
    return randomInt(0, 1_000_000).toString().padStart(6, '0');
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }

  private log(action: 'otp_request' | 'otp_verify', idHash: string, ip: string, result: Parameters<OtpLogger['log']>[0]['result']): void {
    this.logger.log({ action, phoneHash: idHash, ip, result });
  }
}
