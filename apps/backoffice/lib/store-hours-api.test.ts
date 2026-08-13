import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-client';
import { fetchStoreHours, saveStoreHours } from './store-hours-api';

vi.mock('./api-client', () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

describe('store-hours-api', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('carrega horários por loja', async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ shifts: [] }), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await expect(fetchStoreHours('store/1')).resolves.toEqual({ shifts: [] });
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/stores/store%2F1/hours');
  });

  it('salva o conjunto inteiro via PUT', async () => {
    const input = {
      shifts: [{ dayOfWeek: 'friday' as const, opensAtMinutes: 22 * 60, closesAtMinutes: 2 * 60 }],
    };
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(input), { status: 200, headers: { 'content-type': 'application/json' } }),
    );

    await expect(saveStoreHours('store-1', input)).resolves.toEqual(input);
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/stores/store-1/hours', {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    });
  });
});
