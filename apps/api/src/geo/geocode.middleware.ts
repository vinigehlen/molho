import {
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  type NestMiddleware,
  UnprocessableEntityException,
} from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { normalizePostalCode } from '@molho/contracts';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import { GEOCODER, type GeocodedAddress, type Geocoder } from './geocoder';
import { GEOCODE_RATE_LIMITER } from './geo.tokens';
import { resolveAddress } from './resolve-address';

export interface RequestWithGeocode extends Request {
  /** Preenchido pelo GeocodeMiddleware. Ausente = o DTO vai rejeitar o body. */
  geocoded?: GeocodedAddress;
}

/** 20 endereços/minuto por IP — folgado pra humano, apertado pra bot. */
export const GEOCODE_IP_LIMIT = 20;
export const GEOCODE_IP_WINDOW_SECONDS = 60;

/**
 * Cap por IP das rotas que disparam HTTP EXTERNO.
 *
 * É MIDDLEWARE, e não um `CanActivate`, por ordem de execução: Guards rodam
 * DEPOIS de todo middleware, então um guard não protegeria a chamada externa
 * que o GeocodeMiddleware faz. Tem que vir antes dele no `apply()` — a ordem
 * do `apply()` é a ordem de execução.
 *
 * Chave só por IP (não por slug, diferente do StorefrontRateLimitGuard): o
 * recurso protegido aqui é a cota do ViaCEP/Nominatim e a conexão do pool,
 * que são GLOBAIS — um bot varrendo 50 lojas nossas gasta a mesma cota
 * externa que varrendo uma.
 */
@Injectable()
export class GeocodeIpRateLimitMiddleware implements NestMiddleware {
  constructor(@Inject(GEOCODE_RATE_LIMITER) private readonly rateLimiter: RateLimiter) {}

  async use(request: Request, _response: Response, next: NextFunction): Promise<void> {
    // Mesma convenção (e mesmo débito de `trust proxy`) dos outros limitadores.
    const ip = request.ip ?? '0.0.0.0';
    const dentroDoLimite = await this.rateLimiter.checkAndRecord(
      `geo:rl:ip:${ip}`,
      GEOCODE_IP_LIMIT,
      GEOCODE_IP_WINDOW_SECONDS,
    );
    if (!dentroDoLimite) {
      throw new HttpException(
        { error: 'rate_limited', message: 'Muitas consultas de endereço. Tente de novo em instantes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
    next();
  }
}

/**
 * Resolve CEP → endereço + ponto ANTES de qualquer conexão do Postgres ser
 * adquirida.
 *
 * É a única camada onde isso pode acontecer: `TenantContextInterceptor` abre
 * `RequestContextService.run()` envolvendo o handler inteiro, e essa
 * transação FIXA uma conexão do pool. HTTP externo de 2–5s lá dentro esgota o
 * pool sob carga — e `/checkout/revalidate` é público e pré-OTP, então seria
 * weaponizável (CLAUDE.md § Contexto de request). Middleware roda antes de
 * Guards e Interceptors; é aqui ou em lugar nenhum.
 *
 * O 422 daqui tem UM significado só: **não sabemos nem a cidade**. "Cidade
 * conhecida mas não atendida" NÃO é erro — é resposta de negócio (200 com
 * `withinZone: false`), e quem decide isso é o banco, depois.
 */
@Injectable()
export class GeocodeMiddleware implements NestMiddleware {
  constructor(@Inject(GEOCODER) private readonly geocoder: Geocoder) {}

  async use(request: RequestWithGeocode, _response: Response, next: NextFunction): Promise<void> {
    // `/delivery-match` manda o endereço na raiz; o checkout manda em `address`.
    const body = asRecord(request.body);
    const source = asRecord(body?.address) ?? body;

    const postalCode = asString(source?.postalCode);
    // Formato inválido segue adiante SEM geocodar: quem devolve o 400 com a
    // mensagem de campo é o ValidationPipe, que roda depois. Geocodar lixo
    // seria pagar HTTP externo por um request que já vai ser rejeitado.
    if (!postalCode || !normalizePostalCode(postalCode)) return next();

    const geocoded = await this.geocoder.resolve({ postalCode, number: asString(source?.number) });
    request.geocoded = geocoded;

    // A cidade é o que decide a taxa. Sem ela — nem do ViaCEP, nem do texto
    // do cliente — não há como prosseguir de forma nenhuma.
    const { city } = resolveAddress(
      {
        street: asString(source?.street) ?? '',
        neighborhood: asString(source?.neighborhood) ?? '',
        city: asString(source?.city) ?? '',
        state: asString(source?.state) ?? '',
      },
      geocoded,
    );

    if (!city) {
      throw new UnprocessableEntityException({
        error: 'address_unresolvable',
        // Distingue as duas causas pro cliente e pro log; a cópia cobre as
        // duas porque o cliente não tem como saber qual foi.
        reason: geocoded.postalCodeFound ? 'no_city' : 'cep_not_found',
        message: 'Não consegui encontrar esse CEP. Confere o número do CEP — se estiver certo, tente de novo em instantes.',
      });
    }

    next();
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
