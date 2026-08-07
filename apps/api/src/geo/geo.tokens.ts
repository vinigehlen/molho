/** Token em arquivo próprio — mesmo motivo de `storefront.tokens.ts`: evita o ciclo middleware→module→middleware. */
export const GEOCODE_RATE_LIMITER = Symbol('GEOCODE_RATE_LIMITER');
