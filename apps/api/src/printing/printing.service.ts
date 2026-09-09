import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { buildCounterTicket, buildKitchenTicket } from './print-ticket';
import type {
  ClaimPrintJobParams,
  FailPrintJobParams,
  FinishPrintJobParams,
  PrintJobRecord,
  PrintJobRepository,
  PrintQueueStatus,
} from './print-job.repository';

const INITIAL_TICKET_WIDTH = 80;
const INITIAL_TICKET_CUT = true;

/** As duas vias de cada pedido. `counter` = conferência do balcão (tudo);
 *  `kitchen` = cozinha (sem preço/endereço). */
export const TICKET_COPIES = ['counter', 'kitchen'] as const;
export type TicketCopy = (typeof TICKET_COPIES)[number];

export interface QueueOrderTicketsParams {
  orderId: string;
  /** Prefixo da chave de idempotência; vira `<prefix>:counter` e `<prefix>:kitchen`. */
  idempotencyPrefix: string;
  width: number;
  cut: boolean;
}

export class PrintOrderNotFoundError extends Error {
  constructor() {
    super('Pedido não encontrado.');
  }
}

export class PrintJobConflictError extends Error {
  constructor() {
    super('Job de impressão mudou antes da conclusão.');
  }
}

export class PrintingService {
  constructor(
    private readonly repo: PrintJobRepository,
    private readonly requestContext: RequestContextService,
    private readonly moduleCache: ModuleCache,
  ) {}

  /** Enfileira as DUAS vias do pedido (balcão + cozinha), uma por job. */
  async queueOrderTickets(params: QueueOrderTicketsParams): Promise<PrintJobRecord[]> {
    const order = await this.repo.findOrderForTicket(params.orderId);
    if (!order) throw new PrintOrderNotFoundError();

    const jobs: PrintJobRecord[] = [];
    for (const copy of TICKET_COPIES) {
      jobs.push(
        await this.repo.createIdempotent({
          orderId: params.orderId,
          idempotencyKey: `${params.idempotencyPrefix}:${copy}`,
          ticketText: copy === 'counter' ? buildCounterTicket(order) : buildKitchenTicket(order),
          width: params.width,
          cut: params.cut,
        }),
      );
    }
    return jobs;
  }

  async queueInitialOrderTicketsIfActive(orderId: string): Promise<PrintJobRecord[] | null> {
    if (!(await this.isPrintingActive())) return null;
    return this.queueOrderTickets({
      orderId,
      idempotencyPrefix: `order:${orderId}:v2`,
      width: INITIAL_TICKET_WIDTH,
      cut: INITIAL_TICKET_CUT,
    });
  }

  claimNext(params: ClaimPrintJobParams): Promise<PrintJobRecord | null> {
    return this.repo.claimNext(params);
  }

  async markPrinted(params: FinishPrintJobParams): Promise<void> {
    const updated = await this.repo.markPrinted(params);
    if (!updated) throw new PrintJobConflictError();
  }

  async markFailed(params: FailPrintJobParams): Promise<void> {
    const updated = await this.repo.markFailed(params);
    if (!updated) throw new PrintJobConflictError();
  }

  status(): Promise<PrintQueueStatus> {
    return this.repo.getStatus();
  }

  private async isPrintingActive(): Promise<boolean> {
    const tenantId = this.requestContext.getTenantId();
    const moduleService = new ModuleService({
      db: new PrismaModuleDataSource(this.requestContext.getClient()),
      cache: this.moduleCache,
    });
    return moduleService.isModuleActive(tenantId, 'printing.escpos');
  }
}
