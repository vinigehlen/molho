import { HttpException, HttpStatus, Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import { CHECKOUT_ORDER_RATE_LIMITER } from './orders.tokens';

/** 5 pedidos por 10 minutos, por (loja + IP). */
export const CHECKOUT_ORDER_RATE_LIMIT = 5;
export const CHECKOUT_ORDER_RATE_WINDOW_SECONDS = 600;

/**
 * Cap de criação de pedido. Existe porque `checkout.guest` (CLAUDE.md regra 13,
 * EMENDA) transforma `POST /checkout/orders` em ESCRITA PÚBLICA: sem OTP, o
 * pedágio incidental que segurava spam de pedido some. Cada pedido de bot é
 * linha em `orders` + `order_items` + `addresses`, um telefone cifrado e um
 * cutuque SSE no gestor — barulho na cozinha no meio do jantar é o dano real.
 *
 * **MIDDLEWARE, não `CanActivate`**, e registrado ANTES do `GeocodeMiddleware`
 * no `AppModule`: guard roda depois de todo middleware, então um guard só
 * barraria o bot DEPOIS de o geocode já ter pago ViaCEP/Nominatim. Mesmo
 * racional (e mesma armadilha) do `GeocodeIpRateLimitMiddleware`.
 *
 * Chave (slug + IP), como no `StorefrontRateLimitGuard`: o recurso protegido é
 * a fila de UMA loja, e um CGNAT de operadora móvel põe dezenas de celulares
 * atrás do mesmo IP público. Balde SEPARADO do cardápio de propósito — navegar
 * não pode consumir a cota de pedir.
 *
 * Vale pro caminho autenticado também, não só pro guest: 5 pedidos em 10min é
 * folgado pra qualquer humano, e um cap que só existe num dos caminhos é um cap
 * que alguém esquece de ligar quando o outro caminho vira o padrão.
 */
@Injectable()
export class CheckoutOrderRateLimitMiddleware implements NestMiddleware {
  constructor(@Inject(CHECKOUT_ORDER_RATE_LIMITER) private readonly rateLimiter: RateLimiter) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    // `trust proxy` já configurado no bootstrap — atrás da Fly isto é o IP do
    // cliente, não o do proxy (ver bootstrap/trust-proxy.ts).
    const ip = request.ip ?? '0.0.0.0';
    const slug = (request.params as Record<string, string> | undefined)?.slug ?? slugDaUrl(request);

    const dentroDoLimite = await this.rateLimiter.checkAndRecord(
      `checkout:orders:rl:${slug}:${ip}`,
      CHECKOUT_ORDER_RATE_LIMIT,
      CHECKOUT_ORDER_RATE_WINDOW_SECONDS,
    );
    if (!dentroDoLimite) {
      throw new HttpException(
        { error: 'rate_limited', message: 'Muitos pedidos seguidos. Tente de novo em alguns minutos.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    next();
  }
}

/**
 * Middleware do Express roda ANTES do roteamento do Nest, então
 * `request.params` costuma vir vazio — o slug tem que sair da própria URL.
 * Sem slug, cai num balde único ('desconhecido'), que é o lado seguro: aperta
 * demais, nunca de menos.
 */
function slugDaUrl(request: Request): string {
  return /\/v1\/store\/([^/]+)\//.exec(request.originalUrl ?? '')?.[1] ?? 'desconhecido';
}
