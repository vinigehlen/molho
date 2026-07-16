export class InvalidTokenError extends Error {
  constructor(reason: string) {
    super(`Token inválido: ${reason}`);
    this.name = 'InvalidTokenError';
  }
}

export class ExpiredTokenError extends Error {
  constructor() {
    super('Token expirado');
    this.name = 'ExpiredTokenError';
  }
}

/** tokenVersion do JWT ficou pra trás do users.token_version — revogado. */
export class RevokedTokenError extends Error {
  constructor() {
    super('Token revogado');
    this.name = 'RevokedTokenError';
  }
}

/**
 * O mesmo refresh token foi apresentado 2x. Ou o cliente duplicou a
 * chamada, ou alguém roubou o token — os dois casos são tratados igual
 * (derruba TODAS as sessões do user, ver TokenService.rotateTokens).
 */
export class ReusedRefreshError extends Error {
  constructor(public readonly userId: string) {
    super('Refresh token reutilizado — todas as sessões foram revogadas');
    this.name = 'ReusedRefreshError';
  }
}
