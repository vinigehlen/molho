export class SignupRateLimitedError extends Error {
  constructor(public readonly kind: 'ip' | 'email') {
    super('Rate limit de signup excedido.');
    this.name = 'SignupRateLimitedError';
  }
}

export class SignupInvalidCodeError extends Error {
  constructor() {
    super('Código inválido ou expirado.');
    this.name = 'SignupInvalidCodeError';
  }
}
