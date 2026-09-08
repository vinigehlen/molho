export class TenantNotFoundError extends Error {
  constructor() {
    super('Tenant não encontrado.');
  }
}

/** markPaid não se aplica a assinatura já cancelada — cancelamento é definitivo (nunca reabre sozinho). */
export class SubscriptionCanceledError extends Error {
  constructor() {
    super('Essa assinatura foi cancelada e não pode ser reativada por aqui.');
  }
}

/** cancel() chamado numa assinatura já cancelada — nunca um no-op silencioso. */
export class SubscriptionAlreadyCanceledError extends Error {
  constructor() {
    super('Essa assinatura já está cancelada.');
  }
}
