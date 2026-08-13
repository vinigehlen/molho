import type { PrintingApi, PrintJob } from './api.js';
import type { Printer } from './printer.js';

export type AgentOnceResult = 'idle' | 'printed' | 'failed' | 'stale';

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
