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
  PrintQueueStatus,
} from './print-job.repository';
import type { PrintTicketOrder } from './print-ticket';
import type { RequestContextService } from '../context/request-context.service';

const ORDER: PrintTicketOrder = {
  id: '018f3f6b-7d1a-7000-9000-000000000123',
  orderNumber: 42,
  createdAt: new Date('2026-08-13T22:42:00.000Z'),
  fulfillmentType: 'delivery',
  fulfillmentDeadlineAt: new Date('2026-08-13T23:30:00.000Z'),
  scheduledFor: null,
  paymentMethod: 'pix',
  changeForCents: null,
  subtotalCents: 1000,
  deliveryFeeCents: 800,
  discountCents: 0,
  totalCents: 1800,
  currentTotalCents: null,
  notes: null,
  customer: { name: 'Maria' },
  store: { timezone: 'America/Sao_Paulo' },
  delivery: {
    label: 'Casa',
    street: 'Rua X',
    number: '123',
    complement: null,
    neighborhood: 'Centro',
    city: 'Sao Paulo',
    state: 'SP',
    postalCode: '00000-000',
    referencePoint: null,
  },
  items: [{ name: 'X-Burger', quantity: 1, lineTotalCents: 1000, notes: null, modifiers: [] }],
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
  queueStatus: PrintQueueStatus = {
    queued: 1,
    printing: 2,
    failed: 3,
    stalePrinting: 1,
    oldestQueuedAt: new Date('2026-08-13T22:43:00.000Z'),
    lastFailureAt: new Date('2026-08-13T22:44:00.000Z'),
    lastError: 'sem papel',
  };

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

  async getStatus(): Promise<PrintQueueStatus> {
    return this.queueStatus;
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
  it('enfileira as DUAS vias (balcao + cozinha) com conteudo diferente', async () => {
    const repo = new FakeRepo();

    const jobs = await service(repo).queueOrderTickets({
      orderId: ORDER.id,
      idempotencyPrefix: 'manual-1',
      width: 80,
      cut: true,
    });

    expect(jobs).toHaveLength(2);
    expect(repo.created.map((p) => p.idempotencyKey)).toEqual(['manual-1:counter', 'manual-1:kitchen']);

    const [counter, kitchen] = repo.created;
    expect(counter?.ticketText).toContain('VIA BALCAO');
    expect(counter?.ticketText).toContain('PEDIDO #00042');
    expect(counter?.ticketText).toContain('Rua X, 123');
    expect(counter?.ticketText).toContain('R$');
    expect(counter?.ticketText).toContain('Pagamento: PIX');

    expect(kitchen?.ticketText).toContain('VIA COZINHA');
    expect(kitchen?.ticketText).toContain('PEDIDO #00042');
    expect(kitchen?.ticketText).toContain('1x X-Burger');
    expect(kitchen?.ticketText).not.toContain('R$');
    expect(kitchen?.ticketText).not.toContain('Rua X');
  });

  it('reimpressao usa outro prefixo, mesmas duas vias', async () => {
    const repo = new FakeRepo();
    const printing = service(repo);

    await printing.queueOrderTickets({ orderId: ORDER.id, idempotencyPrefix: 'a', width: 80, cut: true });
    await printing.queueOrderTickets({ orderId: ORDER.id, idempotencyPrefix: 'b', width: 80, cut: true });

    expect(repo.created.map((p) => p.idempotencyKey)).toEqual(['a:counter', 'a:kitchen', 'b:counter', 'b:kitchen']);
  });

  it('via automatica inicial nao cria job quando modulo de impressao esta desligado', async () => {
    const repo = new FakeRepo();

    const result = await service(repo, false).queueInitialOrderTicketsIfActive(ORDER.id);

    expect(result).toBeNull();
    expect(repo.created).toHaveLength(0);
  });

  it('via automatica inicial usa prefixo deterministico, 80mm e corte, duas vias', async () => {
    const repo = new FakeRepo();

    await service(repo).queueInitialOrderTicketsIfActive(ORDER.id);

    expect(repo.created.map((p) => p.idempotencyKey)).toEqual([
      `order:${ORDER.id}:v2:counter`,
      `order:${ORDER.id}:v2:kitchen`,
    ]);
    expect(repo.created[0]).toMatchObject({ width: 80, cut: true });
  });

  it('pedido inexistente vira erro de dominio', async () => {
    const repo = new FakeRepo();
    repo.order = null;

    await expect(
      service(repo).queueOrderTickets({ orderId: ORDER.id, idempotencyPrefix: 'x', width: 80, cut: true }),
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

  it('expoe resumo operacional da fila', async () => {
    await expect(service(new FakeRepo()).status()).resolves.toMatchObject({
      queued: 1,
      printing: 2,
      failed: 3,
      stalePrinting: 1,
      lastError: 'sem papel',
    });
  });
});
