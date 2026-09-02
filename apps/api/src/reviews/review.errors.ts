/** Pedido não existe, não é dessa cliente, ou não está `completed` (regra D1: só avalia pedido concluído). */
export class OrderNotEligibleForReviewError extends Error {
  constructor() {
    super('Esse pedido não pode ser avaliado.');
  }
}

/** Um review por pedido (índice único parcial na migration). */
export class ReviewAlreadyExistsError extends Error {
  constructor() {
    super('Esse pedido já foi avaliado.');
  }
}

export class ReviewNotFoundError extends Error {
  constructor() {
    super('Avaliação não encontrada.');
  }
}

/** Optimistic locking — mesma família de ConflictError do resto do repo. */
export class ReviewConflictError extends Error {
  constructor() {
    super('Essa avaliação foi alterada por outra pessoa. Recarregue e tente de novo.');
  }
}
