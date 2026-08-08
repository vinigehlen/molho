import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDeliveryMatch } from './delivery-match-api';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('fetchDeliveryMatch', () => {
  it('dentro da zona: devolve o payload tipado', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ withinZone: true, zoneName: 'Zona padrão', feeCents: 800, etaMinMinutes: 30, etaMaxMinutes: 50 }),
      })),
    );

    const result = await fetchDeliveryMatch('hamburgueria-da-vila', '93600-000', '1684');
    expect(result).toEqual({ withinZone: true, zoneName: 'Zona padrão', feeCents: 800, etaMinMinutes: 30, etaMaxMinutes: 50 });
  });

  it('fora da zona: devolve o discriminante false', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ withinZone: false }) })),
    );

    expect(await fetchDeliveryMatch('hamburgueria-da-vila', '93600-000', '1684')).toEqual({ withinZone: false });
  });

  it('resposta não-200: devolve null, nunca lança', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => ({}) })));

    expect(await fetchDeliveryMatch('hamburgueria-da-vila', '93600-000', '1684')).toBeNull();
  });

  it('erro de rede: devolve null, nunca lança', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('network down');
      }),
    );

    await expect(fetchDeliveryMatch('hamburgueria-da-vila', '93600-000', '1684')).resolves.toBeNull();
  });

  it('payload em formato inesperado: devolve null', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({ algumaCoisa: true }) })));

    expect(await fetchDeliveryMatch('hamburgueria-da-vila', '93600-000', '1684')).toBeNull();
  });
});
