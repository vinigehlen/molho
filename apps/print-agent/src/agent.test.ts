import { describe, expect, it, vi } from 'vitest';
import { createAgentRunStats, recordAgentError, recordAgentResult, runOnce } from './agent.js';
import type { PrintJob } from './api.js';

const JOB: PrintJob = {
  id: 'job-1',
  orderId: 'order-1',
  status: 'printing',
  ticketText: 'PEDIDO #1',
  width: 80,
  cut: true,
  version: 1,
  leasedBy: 'agent-1',
  leaseUntil: '2026-08-13T20:02:00.000Z',
};

const logger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
};

describe('runOnce', () => {
  it('sem job fica idle', async () => {
    await expect(
      runOnce({
        api: { claimNext: vi.fn().mockResolvedValue(null), markPrinted: vi.fn(), markFailed: vi.fn() },
        printer: { print: vi.fn() },
        logger,
      }),
    ).resolves.toBe('idle');
  });

  it('imprime e confirma printed', async () => {
    const print = vi.fn().mockResolvedValue(undefined);
    const markPrinted = vi.fn().mockResolvedValue(true);

    await expect(
      runOnce({
        api: { claimNext: vi.fn().mockResolvedValue(JOB), markPrinted, markFailed: vi.fn() },
        printer: { print },
        logger,
      }),
    ).resolves.toBe('printed');

    expect(print).toHaveBeenCalledWith('PEDIDO #1', { cut: true });
    expect(markPrinted).toHaveBeenCalledWith(JOB);
  });

  it('registra failed quando a impressora falha', async () => {
    const markFailed = vi.fn().mockResolvedValue(true);

    await expect(
      runOnce({
        api: { claimNext: vi.fn().mockResolvedValue(JOB), markPrinted: vi.fn(), markFailed },
        printer: { print: vi.fn().mockRejectedValue(new Error('sem papel')) },
        logger,
      }),
    ).resolves.toBe('failed');

    expect(markFailed).toHaveBeenCalledWith(JOB, 'sem papel');
  });

  it('409 na conclusão vira stale', async () => {
    await expect(
      runOnce({
        api: { claimNext: vi.fn().mockResolvedValue(JOB), markPrinted: vi.fn().mockResolvedValue(false), markFailed: vi.fn() },
        printer: { print: vi.fn().mockResolvedValue(undefined) },
        logger,
      }),
    ).resolves.toBe('stale');
  });
});

describe('run stats', () => {
  it('contabiliza resultados e erros sem depender de estado global', () => {
    const start = new Date('2026-08-13T20:00:00.000Z');
    const later = new Date('2026-08-13T20:01:00.000Z');
    const stats = recordAgentError(recordAgentResult(createAgentRunStats(start), 'printed', later), new Error('rede caiu'), later);

    expect(stats).toMatchObject({
      printed: 1,
      failed: 0,
      lastResult: 'printed',
      lastError: 'rede caiu',
      startedAt: start,
      updatedAt: later,
    });
  });
});
