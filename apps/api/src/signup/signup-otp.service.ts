import { createHmac, randomInt } from 'node:crypto';
import type { EmailAddress } from '@molho/contracts';
import type { EmailProvider } from '../messaging/email-provider.port';
import type { OtpChallengeStore } from '../auth/otp/otp-challenge-store';
import { identityOnly } from '../auth/otp/otp-recipient';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import { SignupInvalidCodeError, SignupRateLimitedError } from './signup.errors';

const SCOPE = 'signup';
const CODE_TTL_SECONDS = 10 * 60;
const MAX_VERIFY_ATTEMPTS = 3;
export const SIGNUP_IP_LIMIT_PER_HOUR = 3;
export const SIGNUP_EMAIL_LIMIT_PER_HOUR = 5;
const WINDOW_SECONDS = 60 * 60;

export class SignupOtpService {
  constructor(
    private readonly challengeStore: OtpChallengeStore,
    private readonly rateLimiter: RateLimiter,
    private readonly emailProvider: EmailProvider,
    private readonly hmacKey: string,
  ) {}

  async request(email: EmailAddress, ip: string): Promise<void> {
    const emailHash = this.hmac(email);
    const ipOk = await this.rateLimiter.checkAndRecord(`signup:rl:ip:${ip}`, SIGNUP_IP_LIMIT_PER_HOUR, WINDOW_SECONDS);
    if (!ipOk) throw new SignupRateLimitedError('ip');

    const emailOk = await this.rateLimiter.checkAndRecord(
      `signup:rl:email:${emailHash}`,
      SIGNUP_EMAIL_LIMIT_PER_HOUR,
      WINDOW_SECONDS,
    );
    if (!emailOk) throw new SignupRateLimitedError('email');

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.challengeStore.create(SCOPE, emailHash, this.hmac(code), CODE_TTL_SECONDS);
    await this.emailProvider.send(email, 'Seu código para criar a loja no Molho', `Seu código Molho é ${code}. Vale por 10 minutos.`);
  }

  async verify(email: EmailAddress, code: string): Promise<void> {
    const recipient = identityOnly(email);
    const emailHash = this.hmac(recipient.identifier);
    const challenge = await this.challengeStore.get(SCOPE, emailHash);
    if (!challenge || challenge.attempts >= MAX_VERIFY_ATTEMPTS) throw new SignupInvalidCodeError();

    if (this.hmac(code) !== challenge.codeHmac) {
      await this.challengeStore.incrementAttempts(SCOPE, emailHash);
      throw new SignupInvalidCodeError();
    }
    await this.challengeStore.delete(SCOPE, emailHash);
  }

  private hmac(value: string): string {
    return createHmac('sha256', this.hmacKey).update(value).digest('hex');
  }
}
