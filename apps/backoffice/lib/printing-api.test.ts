import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PrintingUnavailableError, queueKitchenTicketCopy } from './printing-api';
import { apiFetch } from './api-client';

vi.mock('./api-client', () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

describe('queueKitchenTicketCopy', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('cria segunda via com chave idempotente nova', async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          id: 'job-1',
          orderId: 'order-1',
          idempotencyKey: 'print-copy-1',
          status: 'queued',
          ticketText: 'PEDIDO #ORDER-1',
          width: 80,
          cut: true,
          attempts: 0,
          leaseUntil: null,
          leasedBy: null,
          lastError: null,
          version: 0,
          createdAt: '2026-08-13T20:00:00.000Z',
          printedAt: null,
        }),
        { status: 201, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(queueKitchenTicketCopy('order/1', 'print-copy-1')).resolves.toMatchObject({
      id: 'job-1',
      status: 'queued',
    });

    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/printing/orders/order%2F1/jobs', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ idempotencyKey: 'print-copy-1', width: 80, cut: true }),
    });
  });

  it('traduz 403 em módulo de impressão indisponível', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 403 }));

    await expect(queueKitchenTicketCopy('order-1', 'print-copy-1')).rejects.toBeInstanceOf(PrintingUnavailableError);
  });
});
