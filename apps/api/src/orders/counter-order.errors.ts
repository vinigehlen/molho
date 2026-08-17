/** Loja não existe, está soft-deleted, ou é de outro tenant (RLS torna as duas últimas indistinguíveis de propósito). */
export class CounterOrderStoreNotFoundError extends Error {
  constructor() {
    super('Loja não encontrada.');
    this.name = 'CounterOrderStoreNotFoundError';
  }
}

/** productId (ou modifierId) inexistente, soft-deletado, ou de outro tenant — mesma ambiguidade de propósito da RLS. */
export class CounterOrderProductNotFoundError extends Error {
  constructor(productId: string) {
    super(`Produto "${productId}" não encontrado.`);
    this.name = 'CounterOrderProductNotFoundError';
  }
}

/** Item `weighed` com valor fora da faixa aceitável — POS trust tem teto (CLAUDE.md regra 4: dinheiro é inteiro, nunca sem guarda-corpo). */
export class WeighedPriceOutOfRangeError extends Error {
  constructor(lineTotalCents: number, maxCents: number) {
    super(`Valor do item pesado (${lineTotalCents}) fora da faixa aceitável (1–${maxCents} centavos).`);
    this.name = 'WeighedPriceOutOfRangeError';
  }
}

/** Escrita idempotente exige a chave — sem ela, um retry de rede duplicaria o pedido no caixa. */
export class MissingIdempotencyKeyError extends Error {
  constructor() {
    super('Header Idempotency-Key é obrigatório.');
    this.name = 'MissingIdempotencyKeyError';
  }
}
