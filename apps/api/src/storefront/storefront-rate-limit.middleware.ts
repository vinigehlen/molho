import { HttpException, HttpStatus, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import { STOREFRONT_RATE_LIMITER } from './storefront.tokens';
import { STOREFRONT_RATE_LIMIT, STOREFRONT_RATE_WINDOW_SECONDS } from './storefront-rate-limit.guard';

/**
 * Mesmo balde do storefront público, mas em middleware para rotas públicas de
 * alto volume que não devem depender de Guard para pagar o custo inicial.
 */
@Injectable()
export class StorefrontRateLimitMiddleware implements NestMiddleware {
  constructor(@Inject(STOREFRONT_RATE_LIMITER) private readonly rateLimiter: RateLimiter) {}

  async use(request: Request & { params?: Record<string, string> }, _response: Response, next: NextFunction): Promise<void> {
    const slug = request.params?.slug ?? 'desconhecido';
    const ip = request.ip ?? '0.0.0.0';

    const dentroDoLimite = await this.rateLimiter.checkAndRecord(
      `storefront:rl:${slug}:${ip}`,
      STOREFRONT_RATE_LIMIT,
      STOREFRONT_RATE_WINDOW_SECONDS,
    );

    if (!dentroDoLimite) {
      throw new HttpException(
        { error: 'rate_limited', message: 'Muitas requisições. Tente de novo em instantes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    next();
  }
}
