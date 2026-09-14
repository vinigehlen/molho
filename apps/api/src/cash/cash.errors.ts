export class CashSessionStoreNotFoundError extends Error {
  constructor() {
    super('Loja não encontrada.');
    this.name = 'CashSessionStoreNotFoundError';
  }
}

export class CashSessionAlreadyOpenError extends Error {
  constructor() {
    super('Já existe um caixa aberto nesta loja.');
    this.name = 'CashSessionAlreadyOpenError';
  }
}

/** Balcão (CounterOrderService) e fechamento/sangria lançam isto quando não há sessão aberta. */
export class NoOpenCashSessionError extends Error {
  constructor() {
    super('Nenhum caixa aberto nesta loja. Abra o caixa antes de vender.');
    this.name = 'NoOpenCashSessionError';
  }
}

export class CashSessionNotFoundError extends Error {
  constructor() {
    super('Sessão de caixa não encontrada.');
    this.name = 'CashSessionNotFoundError';
  }
}

export class CashSessionVersionConflictError extends Error {
  constructor() {
    super('Este caixa foi alterado por outra ação. Recarregue e tente de novo.');
    this.name = 'CashSessionVersionConflictError';
  }
}

/** Sangria pedida por quem não tem `cash.withdraw` (não deveria passar do guard, defesa em profundidade). */
export class CashWithdrawalNotAllowedError extends Error {
  constructor() {
    super('Sem permissão para sangria.');
    this.name = 'CashWithdrawalNotAllowedError';
  }
}

/** cashier pediu sangria sem approverUserId/approverPin, ou o approver não é owner/manager desta loja. */
export class CashWithdrawalApprovalRequiredError extends Error {
  constructor() {
    super('Sangria precisa da aprovação de um gerente ou dono com PIN cadastrado.');
    this.name = 'CashWithdrawalApprovalRequiredError';
  }
}

export class CashWithdrawalInvalidPinError extends Error {
  constructor() {
    super('PIN inválido.');
    this.name = 'CashWithdrawalInvalidPinError';
  }
}

export class StaffPinNotSetError extends Error {
  constructor() {
    super('PIN não cadastrado para este usuário.');
    this.name = 'StaffPinNotSetError';
  }
}
