import type { PrintingApi, PrintJob } from './api.js';
import type { Printer } from './printer.js';

export type AgentOnceResult = 'idle' | 'printed' | 'failed' | 'stale';

export interface AgentRunStats {
  idle: number;
  printed: number;
  failed: number;
  stale: number;
  lastResult: AgentOnceResult | null;
  lastJobId: string | null;
  lastError: string | null;
  startedAt: Date;
  updatedAt: Date;
}

export interface AgentLogger {
  info(message: string): void;
  warn(message: string): void;
  error(message: string): void;
}

export interface AgentDeps {
  api: Pick<PrintingApi, 'claimNext' | 'markPrinted' | 'markFailed'>;
  printer: Printer;
  logger: AgentLogger;
}

export async function runOnce({ api, printer, logger }: AgentDeps): Promise<AgentOnceResult> {
  const job = await api.claimNext();
  if (!job) return 'idle';

  try {
    logger.info(`print_job ${job.id} reivindicado; pedido=${job.orderId} versao=${job.version}.`);
    await printer.print(job.ticketText, { cut: job.cut });
    const confirmed = await api.markPrinted(job);
    if (!confirmed) {
      logger.warn(`print_job ${job.id} ja foi alterado por outro worker; ignorando confirmacao stale.`);
      return 'stale';
    }
    logger.info(`print_job ${job.id} impresso.`);
    return 'printed';
  } catch (error) {
    await markFailedQuietly(api, logger, job, error);
    return 'failed';
  }
}

export function createAgentRunStats(now: Date = new Date()): AgentRunStats {
  return {
    idle: 0,
    printed: 0,
    failed: 0,
    stale: 0,
    lastResult: null,
    lastJobId: null,
    lastError: null,
    startedAt: now,
    updatedAt: now,
  };
}

export function recordAgentResult(stats: AgentRunStats, result: AgentOnceResult, now: Date = new Date()): AgentRunStats {
  return {
    ...stats,
    [result]: stats[result] + 1,
    lastResult: result,
    lastError: null,
    updatedAt: now,
  };
}

export function recordAgentError(stats: AgentRunStats, error: unknown, now: Date = new Date()): AgentRunStats {
  return {
    ...stats,
    lastError: error instanceof Error ? error.message : 'erro desconhecido',
    updatedAt: now,
  };
}

async function markFailedQuietly(
  api: Pick<PrintingApi, 'markFailed'>,
  logger: AgentLogger,
  job: PrintJob,
  error: unknown,
): Promise<void> {
  const message = error instanceof Error ? error.message : 'Falha desconhecida na impressao.';
  logger.error(`print_job ${job.id} falhou: ${message}`);
  try {
    await api.markFailed(job, message);
  } catch (markError) {
    const markMessage = markError instanceof Error ? markError.message : 'erro desconhecido';
    logger.error(`nao foi possivel registrar falha do print_job ${job.id}: ${markMessage}`);
  }
}
