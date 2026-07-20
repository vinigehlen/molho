import { type CanActivate, type ExecutionContext, HttpException, HttpStatus, Inject, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import { STOREFRONT_RATE_LIMITER } from './storefront.tokens';

/** 60 leituras do cardápio por minuto, por (loja + IP). */
export const STOREFRONT_RATE_LIMIT = 60;
export const STOREFRONT_RATE_WINDOW_SECONDS = 60;

/**
 * Rate limit da única rota pública do Molho (CLAUDE.md § Segurança: "rate
 * limit no storefront público (evita scraping de preço)").
 *
 * A chave é (slug + IP), não só IP: um concorrente raspando 50 lojas nossas
 * do mesmo IP seria barrado depois de 60 requests no total se a chave fosse
 * só o IP — e um cliente legítimo num CGNAT de operadora móvel (dezenas de
 * celulares atrás do mesmo IP público) seria barrado junto. Por loja, o
 * limite acompanha o uso real: ninguém recarrega o cardápio da MESMA
 * hamburgueria 60 vezes por minuto navegando de verdade.
 *
 * O alvo é scraping massivo, não crawler de buscador: 60/min é folgado o
 * bastante pro Googlebot indexar o cardápio (SEO importa pro lojista) e
 * apertado o bastante pra inviabilizar varredura de catálogo em escala.
 *
 * Este limite NÃO é uma fronteira de autenticação — o cardápio é público por
 * definição. É controle de custo e de abuso.
 */
@Injectable()
export class StorefrontRateLimitGuard implements CanActivate {
  constructor(@Inject(STOREFRONT_RATE_LIMITER) private readonly rateLimiter: RateLimiter) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { params: Record<string, string> }>();
    const slug = request.params?.slug ?? 'desconhecido';
    // Mesma convenção dos controllers de auth. Atenção: sem `trust proxy`
    // configurado, atrás de um proxy isto é o IP do proxy — débito aberto no
    // ledger do CLAUDE.md, vale igual pro rate limit de OTP.
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
    return true;
  }
}
