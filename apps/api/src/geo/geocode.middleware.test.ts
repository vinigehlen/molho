import { HttpException, UnprocessableEntityException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { describe, expect, it, vi } from 'vitest';
import { InMemorySlidingWindowRateLimiter, type RateLimiter } from '../rate-limit/rate-limiter';
import { GEOCODE_IP_LIMIT, GeocodeIpRateLimitMiddleware, GeocodeMiddleware, type RequestWithGeocode } from './geocode.middleware';
import type { GeocodeInput, GeocodedAddress, Geocoder } from './geocoder';

const RESOLVIDO: GeocodedAddress = {
  street: 'Avenida Brasil',
  neighborhood: 'Rincão',
  city: 'Estância Velha',
  state: 'RS',
  lat: -29.6482,
  lng: -51.1789,
  precision: 'address',
  postalCodeFound: true,
};

class FakeGeocoder implements Geocoder {
  chamadas: GeocodeInput[] = [];
  resposta: GeocodedAddress = RESOLVIDO;

  async resolve(input: GeocodeInput): Promise<GeocodedAddress> {
    this.chamadas.push(input);
    return this.resposta;
  }
}

function req(body: unknown, ip = '10.0.0.1'): RequestWithGeocode {
  return { body, ip } as RequestWithGeocode;
}

const res = {} as Response;

describe('GeocodeMiddleware', () => {
  it('resolve o CEP e anexa req.geocoded (body do checkout, endereço em `address`)', async () => {
    const geocoder = new FakeGeocoder();
    const request = req({ address: { postalCode: '93600-000', number: '1684', city: '', street: '', neighborhood: '', state: '' } });
    const next = vi.fn() as unknown as NextFunction;

    await new GeocodeMiddleware(geocoder).use(request, res, next);

    expect(geocoder.chamadas).toEqual([{ postalCode: '93600-000', number: '1684' }]);
    expect(request.geocoded).toEqual(RESOLVIDO);
    expect(next).toHaveBeenCalledOnce();
  });

  it('aceita o endereço na RAIZ do body (/delivery-match)', async () => {
    const geocoder = new FakeGeocoder();
    const request = req({ postalCode: '93600000', number: '1684' });

    await new GeocodeMiddleware(geocoder).use(request, res, vi.fn() as unknown as NextFunction);

    expect(request.geocoded).toEqual(RESOLVIDO);
  });

  it('CEP com formato inválido segue sem geocodar — quem rejeita é o ValidationPipe', async () => {
    const geocoder = new FakeGeocoder();
    const next = vi.fn() as unknown as NextFunction;

    await new GeocodeMiddleware(geocoder).use(req({ address: { postalCode: '123' } }), res, next);

    // Pagar HTTP externo por um request que já vai ser rejeitado é o que não
    // pode acontecer.
    expect(geocoder.chamadas).toEqual([]);
    expect(next).toHaveBeenCalledOnce();
  });

  it('CEP inexistente: 422 com reason cep_not_found — não sabemos nem a cidade', async () => {
    const geocoder = new FakeGeocoder();
    geocoder.resposta = { ...RESOLVIDO, street: null, neighborhood: null, city: null, state: null, lat: null, lng: null, precision: 'unverified', postalCodeFound: false };
    const request = req({ address: { postalCode: '00000-000', number: '1', city: '', street: '', neighborhood: '', state: '' } });

    await expect(new GeocodeMiddleware(geocoder).use(request, res, vi.fn() as unknown as NextFunction)).rejects.toThrow(
      UnprocessableEntityException,
    );

    await new GeocodeMiddleware(geocoder)
      .use(request, res, vi.fn() as unknown as NextFunction)
      .catch((erro: UnprocessableEntityException) => {
        expect(erro.getResponse()).toMatchObject({ error: 'address_unresolvable', reason: 'cep_not_found' });
      });
  });

  it('ViaCEP mudo mas cliente mandou cidade: PASSA (a cidade decide a taxa)', async () => {
    const geocoder = new FakeGeocoder();
    geocoder.resposta = { ...RESOLVIDO, street: null, neighborhood: null, city: null, state: null, postalCodeFound: false };
    const request = req({
      address: { postalCode: '93600-000', number: '1684', city: 'Estância Velha', state: 'RS', street: 'Av. Brasil', neighborhood: 'Centro' },
    });
    const next = vi.fn() as unknown as NextFunction;

    await new GeocodeMiddleware(geocoder).use(request, res, next);

    expect(next).toHaveBeenCalledOnce();
    expect(request.geocoded?.postalCodeFound).toBe(false);
  });

  it('sem ponto nenhum mas com cidade do ViaCEP: PASSA — ponto não bloqueia', async () => {
    const geocoder = new FakeGeocoder();
    geocoder.resposta = { ...RESOLVIDO, lat: null, lng: null, precision: 'unverified' };
    const request = req({ address: { postalCode: '93600-000', number: '1684', city: '', street: '', neighborhood: '', state: '' } });
    const next = vi.fn() as unknown as NextFunction;

    await new GeocodeMiddleware(geocoder).use(request, res, next);

    expect(next).toHaveBeenCalledOnce();
  });
});

describe('GeocodeIpRateLimitMiddleware', () => {
  it('deixa passar dentro do limite e barra com 429 depois dele', async () => {
    const limiter: RateLimiter = new InMemorySlidingWindowRateLimiter();
    const middleware = new GeocodeIpRateLimitMiddleware(limiter);
    const next = vi.fn() as unknown as NextFunction;

    for (let i = 0; i < GEOCODE_IP_LIMIT; i++) {
      await middleware.use(req(null) as Request, res, next);
    }
    expect(next).toHaveBeenCalledTimes(GEOCODE_IP_LIMIT);

    await expect(middleware.use(req(null) as Request, res, next)).rejects.toThrow(HttpException);
    // Barrado é barrado: não segue pro middleware de geocode.
    expect(next).toHaveBeenCalledTimes(GEOCODE_IP_LIMIT);
  });

  it('conta por IP — outro IP não herda o consumo do primeiro', async () => {
    const middleware = new GeocodeIpRateLimitMiddleware(new InMemorySlidingWindowRateLimiter());
    const next = vi.fn() as unknown as NextFunction;

    for (let i = 0; i < GEOCODE_IP_LIMIT; i++) {
      await middleware.use(req(null, '10.0.0.1') as Request, res, next);
    }

    await expect(middleware.use(req(null, '10.0.0.2') as Request, res, next)).resolves.toBeUndefined();
  });
});
