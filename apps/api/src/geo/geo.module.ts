import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import {
  InMemorySlidingWindowRateLimiter,
  type RateLimiter,
  RedisSlidingWindowRateLimiter,
} from '../rate-limit/rate-limiter';
import { GeocodeIpRateLimitMiddleware, GeocodeMiddleware } from './geocode.middleware';
import { GEOCODER, type GeoCache, InMemoryGeoCache, RedisGeoCache } from './geocoder';
import { GEOCODE_RATE_LIMITER } from './geo.tokens';
import { ViaCepNominatimGeocoder } from './viacep-nominatim.geocoder';

/**
 * Sem REDIS_URL cai em memória (cache, throttle e cap por IP) — mesmo padrão
 * de StorefrontModule/OtpModule. Em produção com 2 instâncias só o Redis
 * conta certo: o throttle de 1 req/s do Nominatim é GLOBAL, e duas instâncias
 * com contadores locais dariam 2 req/s (violação de ToS).
 *
 * Um Redis só pros três usos — são o mesmo servidor, não vale abrir conexões
 * separadas.
 */
@Module({
  providers: [
    GeocodeMiddleware,
    GeocodeIpRateLimitMiddleware,
    {
      provide: GEOCODER,
      useFactory: (): ViaCepNominatimGeocoder => {
        const redis = redisCompartilhado();
        const cache: GeoCache = redis ? new RedisGeoCache(redis) : new InMemoryGeoCache();
        const limiter: RateLimiter = redis
          ? new RedisSlidingWindowRateLimiter(redis)
          : new InMemorySlidingWindowRateLimiter();
        return new ViaCepNominatimGeocoder(cache, limiter);
      },
    },
    {
      provide: GEOCODE_RATE_LIMITER,
      useFactory: (): RateLimiter => {
        const redis = redisCompartilhado();
        return redis ? new RedisSlidingWindowRateLimiter(redis) : new InMemorySlidingWindowRateLimiter();
      },
    },
  ],
  exports: [GEOCODER, GEOCODE_RATE_LIMITER, GeocodeMiddleware, GeocodeIpRateLimitMiddleware],
})
export class GeoModule {}

let conexao: Redis | null | undefined;

function redisCompartilhado(): Redis | null {
  if (conexao === undefined) {
    conexao = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
  }
  return conexao;
}
