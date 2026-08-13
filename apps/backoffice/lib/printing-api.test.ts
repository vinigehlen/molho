import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PrintingUnavailableError,
  claimNextPrintJob,
  fetchPrintQueueStatus,
  markPrintJobFailed,
  markPrintJobPrinted,
  queueKitchenTicketCopy,
} from './printing-api';
import { apiFetch } from './api-client';

vi.mock('./api-client', () => ({
  apiFetch: vi.fn(),
}));

const apiFetchMock = vi.mocked(apiFetch);

function printJob(overrides: Record<string, unknown> = {}) {
  return {
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
    ...overrides,
  };
}

describe('queueKitchenTicketCopy', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('cria segunda via com chave idempotente nova', async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify(printJob()), { status: 201, headers: { 'content-type': 'application/json' } }),
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

describe('fetchPrintQueueStatus', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('carrega o resumo operacional da fila', async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          queued: 2,
          printing: 1,
          failed: 1,
          stalePrinting: 1,
          oldestQueuedAt: '2026-08-13T20:00:00.000Z',
          lastFailureAt: '2026-08-13T20:01:00.000Z',
          lastError: 'sem papel',
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(fetchPrintQueueStatus()).resolves.toMatchObject({
      queued: 2,
      stalePrinting: 1,
      lastError: 'sem papel',
    });
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/printing/status');
  });
});

describe('claimNextPrintJob', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('reivindica o próximo job para o worker', async () => {
    apiFetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify(printJob({ status: 'printing', leasedBy: 'worker-1', leaseUntil: '2026-08-13T20:02:00.000Z', version: 1 })),
        { status: 200, headers: { 'content-type': 'application/json' } },
      ),
    );

    await expect(claimNextPrintJob('worker-1', 120)).resolves.toMatchObject({
      id: 'job-1',
      status: 'printing',
      leasedBy: 'worker-1',
    });

    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/printing/jobs/claim', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workerId: 'worker-1', leaseSeconds: 120, width: 80 }),
    });
  });

  it('sem job elegível vira null', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));

    await expect(claimNextPrintJob('worker-1', 120)).resolves.toBeNull();
  });
});

describe('markPrintJobPrinted', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('confirma impressão com version e worker', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(markPrintJobPrinted({ id: 'job/1', version: 2 }, 'worker-1')).resolves.toBe(true);
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/printing/jobs/job%2F1/printed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 2, workerId: 'worker-1' }),
    });
  });

  it('409 é corrida perdida, não sucesso cego', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 409 }));

    await expect(markPrintJobPrinted({ id: 'job-1', version: 2 }, 'worker-1')).resolves.toBe(false);
  });
});

describe('markPrintJobFailed', () => {
  beforeEach(() => {
    apiFetchMock.mockReset();
  });

  it('registra falha com version, worker e erro', async () => {
    apiFetchMock.mockResolvedValueOnce(new Response(null, { status: 204 }));

    await expect(markPrintJobFailed({ id: 'job-1', version: 2 }, 'worker-1', 'printer offline')).resolves.toBe(true);
    expect(apiFetchMock).toHaveBeenCalledWith('/v1/admin/printing/jobs/job-1/failed', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ version: 2, workerId: 'worker-1', error: 'printer offline' }),
    });
  });
});
