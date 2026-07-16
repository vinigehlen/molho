export type OtpRateLimitKind = 'ip' | 'phone' | 'cooldown';

/** Controller (Épico 3, próximo commit) mapeia pra 429 + Retry-After. */
export class OtpRateLimitedError extends Error {
  constructor(public readonly kind: OtpRateLimitKind) {
    super(`OTP bloqueado por rate limit: ${kind}`);
    this.name = 'OtpRateLimitedError';
  }
}
