/** version do payload ficou pra trás do version da linha — outra requisição já alterou o pedido. */
export class OrderConflictError extends Error {
  constructor() {
    super('Pedido foi alterado por outra requisição — recarregue e tente de novo.');
    this.name = 'OrderConflictError';
  }
}

/** Pedido não existe, está soft-deleted, ou pertence a outro tenant (RLS torna as duas últimas indistinguíveis de propósito). */
export class OrderNotFoundError extends Error {
  constructor() {
    super('Pedido não encontrado.');
    this.name = 'OrderNotFoundError';
  }
}

/** Transição fora da máquina de estados (docs/02-definicoes-v1.md §5.1) — ex.: `ready` → `canceled`. */
export class IllegalOrderTransitionError extends Error {
  constructor(from: string, to: string) {
    super(`Não é possível mudar o pedido de "${from}" para "${to}".`);
    this.name = 'IllegalOrderTransitionError';
  }
}

/** `canceled`/`delivery_failed` exigem motivo (docs/02 §5.2) — CLAUDE.md regra 15. */
export class MissingCancelReasonError extends Error {
  constructor() {
    super('Motivo é obrigatório para cancelar ou registrar falha de entrega.');
    this.name = 'MissingCancelReasonError';
  }
}

/**
 * O `sub` do JWT (CustomerJwtAuthGuard) não corresponde a um customer visível
 * NESTE tenant (RLS tenant-scoped, sem bypass de plataforma) — cliente de
 * outra loja tentando finalizar pedido aqui, ou customer soft-deletado.
 */
export class CheckoutCustomerNotFoundError extends Error {
  constructor() {
    super('Cliente não encontrado.');
    this.name = 'CheckoutCustomerNotFoundError';
  }
}

/** Tenant sem `Store` cadastrada ainda (onboarding incompleto, Épico 13) — não há como nascer um pedido sem loja dona. */
export class CheckoutStoreNotConfiguredError extends Error {
  constructor() {
    super('Loja ainda não está configurada para receber pedidos.');
    this.name = 'CheckoutStoreNotConfiguredError';
  }
}
