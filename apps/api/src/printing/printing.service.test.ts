import { describe, expect, it } from 'vitest';
import type { ModuleCache } from '@molho/db';
import { PrintingService, PrintJobConflictError, PrintOrderNotFoundError } from './printing.service';
import type {
  ClaimPrintJobParams,
  CreatePrintJobParams,
  FailPrintJobParams,
  FinishPrintJobParams,
  PrintJobRecord,
  PrintJobRepository,
} from './print-job.repository';
import type { PrintTicketOrder } from './print-ticket';
import type { RequestContextService } from '../context/request-context.service';

const ORDER: PrintTicketOrder = {
  id: '018f3f6b-7d1a-7000-9000-000000000123',
  createdAt: new Date('2026-08-13T22:42:00.000Z'),
  fulfillmentType: 'delivery',
  customer: { name: 'Maria' },
  store: { timezone: 'America/Sao_Paulo' },
  items: [{ name: 'X-Burger', quantity: 1, notes: null, modifiers: [] }],
};

function job(overrides: Partial<PrintJobRecord> = {}): PrintJobRecord {
  return {
    id: 'job-1',
    orderId: ORDER.id,
    idempotencyKey: 'key-1',
    status: 'queued',
    ticketText: 'PEDIDO #018F',
    width: 80,
    cut: true,
    attempts: 0,
    leaseUntil: null,
    leasedBy: null,
    lastError: null,
    version: 0,
    createdAt: new Date('2026-08-13T22:43:00.000Z'),
    printedAt: null,
    ...overrides,
  };
}

class FakeRepo implements PrintJobRepository {
  order: PrintTicketOrder | null = ORDER;
  created: CreatePrintJobParams[] = [];
  nextClaim: PrintJobRecord | null = null;
  printed = true;
  failed = true;

  async findOrderForTicket(): Promise<PrintTicketOrder | null> {
    return this.order;
  }

  async createIdempotent(params: CreatePrintJobParams): Promise<PrintJobRecord> {
    this.created.push(params);
    return job({ idempotencyKey: params.idempotencyKey, ticketText: params.ticketText });
  }

  async claimNext(_params: ClaimPrintJobParams): Promise<PrintJobRecord | null> {
    return this.nextClaim;
  }

  async markPrinted(_params: FinishPrintJobParams): Promise<boolean> {
    return this.printed;
  }

  async markFailed(_params: FailPrintJobParams): Promise<boolean> {
    return this.failed;
  }
}

class FakeRequestContext {
  constructor(private readonly active: boolean) {}

  getTenantId(): string {
    return 'tenant-1';
  }

  getClient() {
    return {
      tenantEntitlement: { findFirst: async () => ({ status: 'active' }) },
      tenantSetting: { findFirst: async () => ({ enabled: true }) },
      featureFlag: { findUnique: async () => ({ enabled: this.active }) },
    };
  }
}

const cache: ModuleCache = {
  get: async () => null,
  set: async () => undefined,
  del: async () => undefined,
};

function service(repo: FakeRepo, active = true): PrintingService {
  return new PrintingService(repo, new FakeRequestContext(active) as unknown as RequestContextService, cache);
}

describe('PrintingService', () => {
  it('cria job idempotente com comanda renderizada', async () => {
    const repo = new FakeRepo();

    const created = await service(repo).queueOrderTicket({
      orderId: ORDER.id,
      idempotencyKey: 'manual-1',
      width: 58,
      cut: false,
    });

    expect(created.idempotencyKey).toBe('manual-1');
    expect(repo.created).toHaveLength(1);
    expect(repo.created[0]).toMatchObject({ orderId: ORDER.id, idempotencyKey: 'manual-1', width: 58, cut: false });
    expect(repo.created[0]?.ticketText).toContain('1x X-Burger');
    expect(repo.created[0]?.ticketText).not.toContain('R$');
  });

  it('segunda via e so outra idempotencyKey para o mesmo pedido', async () => {
    const repo = new FakeRepo();
    const printing = service(repo);

    await printing.queueOrderTicket({ orderId: ORDER.id, idempotencyKey: 'manual-1', width: 80, cut: true });
    await printing.queueOrderTicket({ orderId: ORDER.id, idempotencyKey: 'manual-2', width: 80, cut: true });

    expect(repo.created.map((params) => params.idempotencyKey)).toEqual(['manual-1', 'manual-2']);
  });

  it('via automatica inicial nao cria job quando modulo de impressao esta desligado', async () => {
    const repo = new FakeRepo();

    const result = await service(repo, false).queueInitialOrderTicketIfActive(ORDER.id);

    expect(result).toBeNull();
    expect(repo.created).toHaveLength(0);
  });

  it('via automatica inicial usa chave deterministica, 80mm e corte', async () => {
    const repo = new FakeRepo();

    await service(repo).queueInitialOrderTicketIfActive(ORDER.id);

    expect(repo.created[0]).toMatchObject({
      idempotencyKey: `order:${ORDER.id}:kitchen:v1`,
      width: 80,
      cut: true,
    });
  });

  it('pedido inexistente vira erro de dominio', async () => {
    const repo = new FakeRepo();
    repo.order = null;

    await expect(
      service(repo).queueOrderTicket({ orderId: ORDER.id, idempotencyKey: 'x', width: 80, cut: true }),
    ).rejects.toThrow(PrintOrderNotFoundError);
  });

  it('conclusao stale vira conflito', async () => {
    const repo = new FakeRepo();
    repo.printed = false;

    await expect(service(repo).markPrinted({ id: 'job-1', expectedVersion: 1, workerId: 'worker-1' })).rejects.toThrow(
      PrintJobConflictError,
    );
  });

  it('falha stale tambem vira conflito', async () => {
    const repo = new FakeRepo();
    repo.failed = false;

    await expect(
      service(repo).markFailed({ id: 'job-1', expectedVersion: 1, workerId: 'worker-1', error: 'sem papel' }),
    ).rejects.toThrow(PrintJobConflictError);
  });
});
