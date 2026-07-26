export const CHECKOUT_REVALIDATION_SERVICE = Symbol('CHECKOUT_REVALIDATION_SERVICE');
export const CHECKOUT_ORDER_SERVICE = Symbol('CHECKOUT_ORDER_SERVICE');
export const PAYMENT_CONFIRMATION_SERVICE = Symbol('PAYMENT_CONFIRMATION_SERVICE');
/** Event bus do realtime (Épico 9) — singleton do processo: segura os subscribers SSE entre requests. */
export const ORDER_EVENT_BUS = Symbol('ORDER_EVENT_BUS');
