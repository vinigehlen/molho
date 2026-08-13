import { apiFetch } from './api-client';

export interface QueuePrintJobResult {
  id: string;
  orderId: string;
  idempotencyKey: string;
  status: 'queued' | 'printing' | 'printed' | 'failed';
  ticketText: string;
  width: number;
  cut: boolean;
  attempts: number;
  leaseUntil: string | null;
  leasedBy: string | null;
  lastError: string | null;
  version: number;
  createdAt: string;
  printedAt: string | null;
}

export type ClaimedPrintJob = QueuePrintJobResult & {
  status: 'printing';
  leasedBy: string;
  leaseUntil: string;
};

export class PrintingUnavailableError extends Error {
  constructor() {
    super('Impressão não está ativa para esta loja.');
  }
}

export interface PrintQueueStatus {
  queued: number;
  printing: number;
  failed: number;
  stalePrinting: number;
  oldestQueuedAt: string | null;
  lastFailureAt: string | null;
  lastError: string | null;
}

export async function fetchPrintQueueStatus(): Promise<PrintQueueStatus> {
  const res = await apiFetch('/v1/admin/printing/status');

  if (res.status === 403) throw new PrintingUnavailableError();
  if (!res.ok) throw new Error(`Falha ao carregar status de impressão (${res.status})`);
  return (await res.json()) as PrintQueueStatus;
}

/**
 * Segunda via durável: cada clique gera uma chave nova e cria um job separado.
 * A impressão física acontece no consumidor da fila; aqui só enfileiramos.
 */
export async function queueKitchenTicketCopy(orderId: string, idempotencyKey: string): Promise<QueuePrintJobResult> {
  const res = await apiFetch(`/v1/admin/printing/orders/${encodeURIComponent(orderId)}/jobs`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ idempotencyKey, width: 80, cut: true }),
  });

  if (res.status === 403) throw new PrintingUnavailableError();
  if (!res.ok) throw new Error(`Falha ao enfileirar impressão (${res.status})`);
  return (await res.json()) as QueuePrintJobResult;
}

export async function claimNextPrintJob(workerId: string, leaseSeconds: number, width = 80): Promise<ClaimedPrintJob | null> {
  const res = await apiFetch('/v1/admin/printing/jobs/claim', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ workerId, leaseSeconds, width }),
  });

  if (res.status === 403) throw new PrintingUnavailableError();
  if (!res.ok) throw new Error(`Falha ao buscar impressão (${res.status})`);

  const body = (await res.json()) as Partial<ClaimedPrintJob>;
  return body.id && body.status === 'printing' && body.leasedBy && body.leaseUntil ? (body as ClaimedPrintJob) : null;
}

export async function markPrintJobPrinted(job: Pick<ClaimedPrintJob, 'id' | 'version'>, workerId: string): Promise<boolean> {
  const res = await apiFetch(`/v1/admin/printing/jobs/${encodeURIComponent(job.id)}/printed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: job.version, workerId }),
  });

  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Falha ao confirmar impressão (${res.status})`);
  return true;
}

export async function markPrintJobFailed(job: Pick<ClaimedPrintJob, 'id' | 'version'>, workerId: string, error: string): Promise<boolean> {
  const res = await apiFetch(`/v1/admin/printing/jobs/${encodeURIComponent(job.id)}/failed`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: job.version, workerId, error }),
  });

  if (res.status === 409) return false;
  if (!res.ok) throw new Error(`Falha ao registrar falha de impressão (${res.status})`);
  return true;
}
