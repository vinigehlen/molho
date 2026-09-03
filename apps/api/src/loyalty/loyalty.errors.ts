/** Optimistic locking — mesma família de ConflictError do resto do repo. */
export class LoyaltyConfigConflictError extends Error {
  constructor() {
    super('Essa configuração foi alterada em outra sessão. Recarregue e tente de novo.');
  }
}
