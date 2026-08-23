/** Isolado sem import, mesmo racional de catalog.tokens.ts (evita ciclo controller → module → controller). */
export const COUPON_SERVICE = Symbol('COUPON_SERVICE');
