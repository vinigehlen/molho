export const CHECKOUT_REVALIDATION_SERVICE = Symbol('CHECKOUT_REVALIDATION_SERVICE');
export const CHECKOUT_ORDER_SERVICE = Symbol('CHECKOUT_ORDER_SERVICE');
export const PAYMENT_CONFIRMATION_SERVICE = Symbol('PAYMENT_CONFIRMATION_SERVICE');
/** Event bus do realtime (Épico 9) — singleton do processo: segura os subscribers SSE entre requests. */
export const ORDER_EVENT_BUS = Symbol('ORDER_EVENT_BUS');
/** Máquina de estados (transitionOrderStatus) — exposta ao gestor de pedidos (Épico 9). */
export const ORDER_STATUS_SERVICE = Symbol('ORDER_STATUS_SERVICE');
/** Leitura do gestor (board + detalhe) — Épico 9. */
export const ADMIN_ORDER_REPOSITORY = Symbol('ADMIN_ORDER_REPOSITORY');
/** Balde do cap de criação de pedido (Épico 9c) — separado do STOREFRONT_RATE_LIMITER: navegar não pode consumir a cota de pedir. */
export const CHECKOUT_ORDER_RATE_LIMITER = Symbol('CHECKOUT_ORDER_RATE_LIMITER');
/** Pedido de balcão (walk-in create) — staff bate no caixa, sem checkout do cliente. */
export const COUNTER_ORDER_SERVICE = Symbol('COUNTER_ORDER_SERVICE');
/** Ajuste de itens de um pedido já criado (Épico balcão — order edit). */
export const ORDER_ADJUSTMENT_SERVICE = Symbol('ORDER_ADJUSTMENT_SERVICE');
/** Sinalização manual de pendência no board (Fase 3, plano do gestor de pedidos — Épico 9). */
export const ORDER_FLAG_SERVICE = Symbol('ORDER_FLAG_SERVICE');
