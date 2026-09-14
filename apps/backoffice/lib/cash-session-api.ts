import type {
  CashSessionResponse,
  CashWithdrawalResponse,
  CurrentCashSessionResponse,
  StaffApprover,
} from '@molho/contracts';
import { apiFetch } from './api-client';

export class CashSessionApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CashSessionApiError';
  }
}

async function parseOrThrow<T>(res: Response, fallback: string): Promise<T> {
  if (res.ok) return (await res.json()) as T;
  const body = await res.json().catch(() => null);
  throw new CashSessionApiError((body as { message?: string } | null)?.message ?? `${fallback} (${res.status})`);
}

export async function fetchCurrentCashSession(storeId: string): Promise<CurrentCashSessionResponse> {
  const res = await apiFetch(`/v1/admin/stores/${encodeURIComponent(storeId)}/cash-sessions/current`);
  return parseOrThrow(res, 'Falha ao consultar o caixa');
}

export async function openCashSession(storeId: string, openingAmountCents: number): Promise<CashSessionResponse> {
  const res = await apiFetch(`/v1/admin/stores/${encodeURIComponent(storeId)}/cash-sessions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ openingAmountCents }),
  });
  return parseOrThrow(res, 'Falha ao abrir o caixa');
}

export async function closeCashSession(
  storeId: string,
  sessionId: string,
  countedAmountCents: number,
): Promise<CashSessionResponse> {
  const res = await apiFetch(`/v1/admin/stores/${encodeURIComponent(storeId)}/cash-sessions/${encodeURIComponent(sessionId)}/close`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ countedAmountCents }),
  });
  return parseOrThrow(res, 'Falha ao fechar o caixa');
}

export async function createCashWithdrawal(
  storeId: string,
  sessionId: string,
  input: { amountCents: number; reason?: string; approverUserId?: string; approverPin?: string },
): Promise<CashWithdrawalResponse> {
  const res = await apiFetch(
    `/v1/admin/stores/${encodeURIComponent(storeId)}/cash-sessions/${encodeURIComponent(sessionId)}/withdrawals`,
    {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  return parseOrThrow(res, 'Falha ao registrar a sangria');
}

export async function fetchCashApprovers(storeId: string): Promise<StaffApprover[]> {
  const res = await apiFetch(`/v1/admin/stores/${encodeURIComponent(storeId)}/staff/approvers`);
  return parseOrThrow(res, 'Falha ao listar aprovadores');
}
