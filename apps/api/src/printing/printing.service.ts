import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { buildKitchenTicket } from './print-ticket';
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

export interface QueuePrintJobParams {
  orderId: string;
  idempotencyKey: string;
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

  async queueOrderTicket(params: QueuePrintJobParams): Promise<PrintJobRecord> {
    const order = await this.repo.findOrderForTicket(params.orderId);
    if (!order) throw new PrintOrderNotFoundError();
    return this.repo.createIdempotent({
      orderId: params.orderId,
      idempotencyKey: params.idempotencyKey,
      ticketText: buildKitchenTicket(order),
      width: params.width,
      cut: params.cut,
    });
  }

  async queueInitialOrderTicketIfActive(orderId: string): Promise<PrintJobRecord | null> {
    if (!(await this.isPrintingActive())) return null;
    return this.queueOrderTicket({
      orderId,
      idempotencyKey: `order:${orderId}:kitchen:v1`,
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
