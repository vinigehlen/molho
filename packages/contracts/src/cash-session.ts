/**
 * Contrato de caixa (Épico 20) — docs/HANDOFF-epico-20-pdv-caixa.md.
 *
 * Uma sessão por LOJA (não por operador): abrir, fechar e sangrar são AÇÕES
 * separadas, cada uma com seu próprio ator — a sessão em si só carrega quem
 * abriu/fechou. Sangria exige aprovação: `cashier` (approval:true na matriz
 * de permissões) precisa de um SEGUNDO ator com PIN; `owner`/`manager`
 * auto-aprovam (ver CashWithdrawalService, não dá pra expressar só com
 * schema). Valores sempre inteiros em centavos.
 */

import { z } from 'zod';

export const openCashSessionSchema = z.strictObject({
  openingAmountCents: z.int().min(0),
});
export type OpenCashSessionInput = z.infer<typeof openCashSessionSchema>;

export const closeCashSessionSchema = z.strictObject({
  countedAmountCents: z.int().min(0),
});
export type CloseCashSessionInput = z.infer<typeof closeCashSessionSchema>;

/**
 * `approverUserId`/`approverPin` só são exigidos quando quem pede a sangria
 * tem `approval:true` (cashier) — a UI mostra o campo só nesse caso, mas o
 * SERVIÇO é quem decide (nunca confia num "sou manager" mandado pelo body).
 * Quando quem pede já auto-aprova (owner/manager), os dois campos são
 * ignorados mesmo que venham preenchidos.
 */
export const createCashWithdrawalSchema = z.strictObject({
  amountCents: z.int().min(1),
  reason: z.string().trim().min(1).max(200).optional(),
  approverUserId: z.uuid().optional(),
  approverPin: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, 'PIN precisa ter 4 a 6 dígitos')
    .optional(),
});
export type CreateCashWithdrawalInput = z.infer<typeof createCashWithdrawalSchema>;

export const setStaffPinSchema = z.strictObject({
  pin: z
    .string()
    .trim()
    .regex(/^\d{4,6}$/, 'PIN precisa ter 4 a 6 dígitos'),
});
export type SetStaffPinInput = z.infer<typeof setStaffPinSchema>;

/** owner/manager do tenant — pra UI de sangria oferecer QUEM pode aprovar (nunca confia num userId digitado à mão). */
export interface StaffApprover {
  id: string;
  name: string;
}

export const verifyStaffPinSchema = z.strictObject({
  userId: z.uuid(),
  pin: z.string().trim().min(1).max(6),
});
export type VerifyStaffPinInput = z.infer<typeof verifyStaffPinSchema>;

export const cashSessionStatusSchema = z.enum(['open', 'closed']);
export type CashSessionStatus = z.infer<typeof cashSessionStatusSchema>;

export interface CashSessionResponse {
  id: string;
  storeId: string;
  status: CashSessionStatus;
  openedAt: string;
  openedByUserId: string;
  openingAmountCents: number;
  closedAt: string | null;
  closedByUserId: string | null;
  countedAmountCents: number | null;
  expectedAmountCents: number | null;
  /** Optimistic lock (CLAUDE.md § banco) — o front manda de volta exatamente o que leu em GET current pra fechar; nunca um número calculado no cliente. */
  version: number;
}

/** `null` = nenhuma sessão aberta na loja agora — é o estado que dispara o modal bloqueante no front. */
export type CurrentCashSessionResponse = CashSessionResponse | null;

export interface CashWithdrawalResponse {
  id: string;
  cashSessionId: string;
  amountCents: number;
  reason: string | null;
  requestedByUserId: string;
  approvedByUserId: string;
  createdAt: string;
}

/**
 * Corte de análise por sessão FECHADA (decisão 8 do handoff) — sessão aberta
 * não entra: `expectedAmountCents`/`countedAmountCents` só existem no
 * fechamento, e uma sessão em andamento não tem "quebra de caixa" ainda.
 */
export interface CashSessionReportRow {
  id: string;
  openedByUserId: string;
  closedByUserId: string | null;
  openedAt: string;
  closedAt: string;
  openingAmountCents: number;
  countedAmountCents: number;
  expectedAmountCents: number;
  /** counted - expected — positivo = sobrou dinheiro na gaveta, negativo = faltou. */
  discrepancyCents: number;
  withdrawalsCents: number;
}

export interface CashSessionReportResponse {
  sessions: CashSessionReportRow[];
  totals: {
    openingAmountCents: number;
    countedAmountCents: number;
    expectedAmountCents: number;
    discrepancyCents: number;
    withdrawalsCents: number;
  };
}
