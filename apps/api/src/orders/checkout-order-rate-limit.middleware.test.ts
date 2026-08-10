import { HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import {
  CHECKOUT_ORDER_RATE_LIMIT,
  CHECKOUT_ORDER_RATE_WINDOW_SECONDS,
  CheckoutOrderRateLimitMiddleware,
} from './checkout-order-rate-limit.middleware';

function request(overrides: Partial<Request> = {}): Request {
  return { ip: '1.2.3.4', params: {}, originalUrl: '/v1/store/cabanhas/checkout/orders', ...overrides } as Request;
}

describe('CheckoutOrderRateLimitMiddleware', () => {
  it('dentro do limite: segue pro próximo middleware', async () => {
    const rateLimiter = { checkAndRecord: vi.fn().mockResolvedValue(true) };
    const next = vi.fn();

    await new CheckoutOrderRateLimitMiddleware(rateLimiter as never).use(request(), {} as Response, next);

    expect(next).toHaveBeenCalledOnce();
    expect(rateLimiter.checkAndRecord).toHaveBeenCalledWith(
      'checkout:orders:rl:cabanhas:1.2.3.4',
      CHECKOUT_ORDER_RATE_LIMIT,
      CHECKOUT_ORDER_RATE_WINDOW_SECONDS,
    );
  });

  it('estourou: 429 e NÃO chama next — o geocode (I/O externo) roda depois, então nunca acontece', async () => {
    const rateLimiter = { checkAndRecord: vi.fn().mockResolvedValue(false) };
    const next = vi.fn();
    const middleware = new CheckoutOrderRateLimitMiddleware(rateLimiter as never);

    await expect(middleware.use(request(), {} as Response, next)).rejects.toBeInstanceOf(HttpException);
    expect(next).not.toHaveBeenCalled();
  });

  it('chave por (slug + IP): lojas diferentes no mesmo IP não dividem cota', async () => {
    const rateLimiter = { checkAndRecord: vi.fn().mockResolvedValue(true) };
    const middleware = new CheckoutOrderRateLimitMiddleware(rateLimiter as never);

    await middleware.use(request(), {} as Response, vi.fn());
    await middleware.use(
      request({ originalUrl: '/v1/store/outra-loja/checkout/orders' }),
      {} as Response,
      vi.fn(),
    );

    const chaves = rateLimiter.checkAndRecord.mock.calls.map((call) => call[0]);
    expect(new Set(chaves).size).toBe(2);
  });

  it('slug vem da URL, não de request.params — middleware roda antes do roteamento do Nest', async () => {
    const rateLimiter = { checkAndRecord: vi.fn().mockResolvedValue(true) };

    await new CheckoutOrderRateLimitMiddleware(rateLimiter as never).use(
      request({ params: {} }),
      {} as Response,
      vi.fn(),
    );

    expect(rateLimiter.checkAndRecord.mock.calls[0]?.[0]).toBe('checkout:orders:rl:cabanhas:1.2.3.4');
  });

  it('URL sem slug reconhecível cai num balde único — aperta demais, nunca de menos', async () => {
    const rateLimiter = { checkAndRecord: vi.fn().mockResolvedValue(true) };

    await new CheckoutOrderRateLimitMiddleware(rateLimiter as never).use(
      request({ originalUrl: '/rota/estranha' }),
      {} as Response,
      vi.fn(),
    );

    expect(rateLimiter.checkAndRecord.mock.calls[0]?.[0]).toBe('checkout:orders:rl:desconhecido:1.2.3.4');
  });
});
