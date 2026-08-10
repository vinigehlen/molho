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

/**
 * Tenant sem `Store` cadastrada ainda (onboarding incompleto, Épico 13), OU
 * `Store` sem chave PIX/cidade configuradas (Épico 8) — nos dois casos a
 * loja não tem como receber pedido: sem chave PIX não tem como montar o QR
 * pro cliente pagar, então é a MESMA natureza de erro ("não está pronta pra
 * vender"), não um erro novo.
 */
export class CheckoutStoreNotConfiguredError extends Error {
  constructor() {
    super('Loja ainda não está configurada para receber pedidos.');
    this.name = 'CheckoutStoreNotConfiguredError';
  }
}

/** Staff tenta confirmar um pagamento que já está `confirmado` — distinto de OrderConflictError (aqui não é corrida de `version`, é estado terminal do fluxo de pagamento). */
export class PaymentAlreadyConfirmedError extends Error {
  constructor() {
    super('Pagamento deste pedido já foi confirmado.');
    this.name = 'PaymentAlreadyConfirmedError';
  }
}

/** `paymentMethod` escolhido não está ativo pro tenant (`payments.pix_static`/`payments.on_delivery` desligado) — checagem dinâmica no service, não dá pra saber por decorator estático o método antes de ler o body (docs/02 §5.5). */
export class PaymentMethodNotAvailableError extends Error {
  constructor(paymentMethod: string) {
    super(`Forma de pagamento "${paymentMethod}" não está disponível nesta loja.`);
    this.name = 'PaymentMethodNotAvailableError';
  }
}

/**
 * Gate de pagamento da máquina de estados (docs/02 §5.5): a transição exige
 * `paymentStatus = 'confirmado'` e o pedido não está pago.
 * - `received → preparing` com `pix`: cozinha não prepara PIX não confirmado.
 * - `in_transit → completed` com `cash_on_delivery`/`card_on_delivery`: fecha
 *   o "dado morto" — pós-pago não pode concluir sem alguém confirmar o
 *   recebimento na entrega.
 * Distinto de PaymentAlreadyConfirmedError (lá o problema é já estar pago).
 */
export class PaymentNotConfirmedError extends Error {
  constructor() {
    super('O pagamento deste pedido precisa ser confirmado antes desta etapa.');
    this.name = 'PaymentNotConfirmedError';
  }
}

/** `changeForCents` (troco pedido) menor que o total do pedido — pedir troco pra menos do que se deve não faz sentido (docs/02 §5.5). */
export class InvalidChangeAmountError extends Error {
  constructor() {
    super('O valor informado pra troco é menor que o total do pedido.');
    this.name = 'InvalidChangeAmountError';
  }
}

/**
 * Request anônima (sem `Authorization`) num tenant com `checkout.guest`
 * DESLIGADO — o caminho normal, e o default de qualquer tenant. Vira 401, não
 * 403: o que falta é identidade, e a ação do cliente é fazer o OTP.
 *
 * Nunca é o erro de um token ruim: token presente e inválido morre no
 * `CustomerJwtAuthGuard`, antes daqui (CLAUDE.md regra 13, EMENDA).
 */
export class CheckoutOtpRequiredError extends Error {
  constructor() {
    super('Confirme seu telefone para finalizar o pedido.');
    this.name = 'CheckoutOtpRequiredError';
  }
}

/**
 * Veio JWT de cliente E bloco `customer` no body. Rejeitado, nunca ignorado:
 * silenciosamente descartar o bloco deixaria um cliente logado achar que
 * carimbou o pedido no telefone que digitou — e aceitar o bloco deixaria ele
 * carimbar no telefone de OUTRO. Com token, a identidade é a do token, ponto.
 */
export class GuestCustomerNotAllowedError extends Error {
  constructor() {
    super('Pedido autenticado não aceita dados de cliente no corpo da requisição.');
    this.name = 'GuestCustomerNotAllowedError';
  }
}

/** `checkout.guest` ativo, request anônima, mas sem nome/telefone no body — sem eles a comanda chega anônima na cozinha. */
export class GuestCustomerRequiredError extends Error {
  constructor() {
    super('Informe nome e telefone para finalizar o pedido.');
    this.name = 'GuestCustomerRequiredError';
  }
}
