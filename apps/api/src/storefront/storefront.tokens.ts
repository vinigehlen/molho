/**
 * Tokens de DI em arquivo próprio — mesmo motivo de `catalog.tokens.ts`:
 * controller e module se importariam mutuamente se o token morasse no module
 * (ciclo controller→module→controller, achado no Épico 4).
 */
export const STOREFRONT_SERVICE = Symbol('STOREFRONT_SERVICE');
export const STOREFRONT_RATE_LIMITER = Symbol('STOREFRONT_RATE_LIMITER');
