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

export class PrintingUnavailableError extends Error {
  constructor() {
    super('Impressão não está ativa para esta loja.');
  }
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
