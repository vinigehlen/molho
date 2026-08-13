import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-client';
import {
  DeliveryZoneDuplicateError,
  createDeliveryZone,
  deleteDeliveryZone,
  fetchDeliveryZones,
  updateDeliveryZone,
} from './delivery-zones-api';

vi.mock('./api-client', () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

describe('delivery-zones-api', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('lista zonas por loja', async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify([{ id: 'zone-1', name: 'Centro', kind: 'city' }]), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(fetchDeliveryZones('store/1')).resolves.toHaveLength(1);
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/stores/store%2F1/delivery-zones');
  });

  it('cria zona por cidade com payload do contrato', async () => {
    const body = {
      kind: 'city' as const,
      name: 'Estância Velha',
      city: 'Estância Velha',
      state: 'RS',
      feeCents: 800,
      etaMinMinutes: 30,
      etaMaxMinutes: 50,
      priority: 0,
    };
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'zone-1', ...body }), {
        status: 201,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(createDeliveryZone('store-1', body)).resolves.toMatchObject({ id: 'zone-1' });
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/stores/store-1/delivery-zones', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  });

  it('traduz 409 em erro de duplicata legível', async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ message: 'Já existe uma zona para esta cidade e UF nesta loja.' }), {
        status: 409,
        headers: { 'content-type': 'application/json' },
      }),
    );

    await expect(
      updateDeliveryZone('zone-1', {
        kind: 'city',
        name: 'Portão',
        city: 'Portão',
        state: 'RS',
        feeCents: 1500,
        etaMinMinutes: 40,
        etaMaxMinutes: 60,
        priority: 1,
      }),
    ).rejects.toBeInstanceOf(DeliveryZoneDuplicateError);
  });

  it('soft-delete chama DELETE', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(deleteDeliveryZone('zone/1')).resolves.toBeUndefined();
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/delivery-zones/zone%2F1', { method: 'DELETE' });
  });
});
