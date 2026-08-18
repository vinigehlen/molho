/** Pedido não está mais num status editável — só received/preparing/ready aceitam ajuste. */
export class OrderNotEditableError extends Error {
  constructor(status: string) {
    super(`Pedido no status "${status}" não aceita ajuste de itens.`);
    this.name = 'OrderNotEditableError';
  }
}

/**
 * `orderItemId` inexistente, de outro pedido/tenant, OU já efetivamente
 * removido por um ajuste anterior (quantidade efetiva zerada) — mesma
 * ambiguidade de propósito de outros "not found" do projeto (RLS/soft
 * delete): o cliente não tem como distinguir os casos, e não precisa.
 */
export class OrderAdjustmentItemNotFoundError extends Error {
  constructor(orderItemId: string) {
    super(`Item "${orderItemId}" não encontrado neste pedido.`);
    this.name = 'OrderAdjustmentItemNotFoundError';
  }
}
