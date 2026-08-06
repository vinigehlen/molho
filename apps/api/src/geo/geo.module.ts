import { Module } from '@nestjs/common';
import Redis from 'ioredis';
import {
  InMemorySlidingWindowRateLimiter,
  type RateLimiter,
  RedisSlidingWindowRateLimiter,
} from '../rate-limit/rate-limiter';
import { GEOCODER, type GeoCache, InMemoryGeoCache, RedisGeoCache } from './geocoder';
import { ViaCepNominatimGeocoder } from './viacep-nominatim.geocoder';

/**
 * Sem REDIS_URL cai em memória (cache e throttle) — mesmo padrão de
 * StorefrontModule/OtpModule. Em produção com 2 instâncias só o Redis conta
 * certo: o throttle de 1 req/s do Nominatim é GLOBAL, e duas instâncias com
 * contadores locais dariam 2 req/s (violação de ToS).
 */
@Module({
  providers: [
    {
      provide: GEOCODER,
      useFactory: (): ViaCepNominatimGeocoder => {
        const redis = process.env.REDIS_URL ? new Redis(process.env.REDIS_URL) : null;
        const cache: GeoCache = redis ? new RedisGeoCache(redis) : new InMemoryGeoCache();
        const limiter: RateLimiter = redis
          ? new RedisSlidingWindowRateLimiter(redis)
          : new InMemorySlidingWindowRateLimiter();
        return new ViaCepNominatimGeocoder(cache, limiter);
      },
    },
  ],
  exports: [GEOCODER],
})
export class GeoModule {}
