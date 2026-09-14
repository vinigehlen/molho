'use client';

import { useEffect, useState } from 'react';
import type { CurrentCashSessionResponse, StaffApprover } from '@molho/contracts';
import { MoSheet } from '@molho/ui';
import {
  CashSessionApiError,
  closeCashSession,
  createCashWithdrawal,
  fetchCashApprovers,
  fetchCurrentCashSession,
  openCashSession,
} from '../../../lib/cash-session-api';
import { centsToBRL } from '../../../lib/format';

/** Centavos a partir de um "12,34"/"1234" digitado — nunca confia em parseFloat de moeda (arredondamento). */
function parseBRLToCents(raw: string): number | null {
  const cleaned = raw.trim().replace(/\./g, '').replace(',', '.');
  if (cleaned === '') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.round(value * 100);
}

export interface CashSessionPanelProps {
  storeId: string;
  /** O balcão usa isto pra travar "Finalizar pedido" sem caixa aberto — Épico 20. */
  onSessionChange?: (session: CurrentCashSessionResponse) => void;
}

export function CashSessionPanel({ storeId, onSessionChange }: CashSessionPanelProps) {
  const [session, setSession] = useState<CurrentCashSessionResponse>(null);
  const [loading, setLoading] = useState(true);
  const [openAmount, setOpenAmount] = useState('');
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(false);

  useEffect(() => {
    if (!storeId) return;
    setLoading(true);
    fetchCurrentCashSession(storeId)
      .then((current) => {
        setSession(current);
        onSessionChange?.(current);
      })
      .catch(() => {
        setSession(null);
        onSessionChange?.(null);
      })
      .finally(() => setLoading(false));
    // Só depende de storeId de propósito — onSessionChange é o callback do
    // pai (setState), reexecutar por ele mudar de identidade recarregaria a
    // sessão sem necessidade a cada render do pai.
  }, [storeId]);

  async function handleOpen() {
    const cents = parseBRLToCents(openAmount);
    if (cents === null) {
      setOpenError('Valor inválido.');
      return;
    }
    setOpening(true);
    setOpenError(null);
    try {
      const created = await openCashSession(storeId, cents);
      setSession(created);
      onSessionChange?.(created);
      setOpenAmount('');
    } catch (err) {
      setOpenError(err instanceof CashSessionApiError ? err.message : 'Falha ao abrir o caixa.');
    } finally {
      setOpening(false);
    }
  }

  if (!storeId || loading) return null;

  return (
    <>
      {/* Modal BLOQUEANTE — onOpenChange ignora tentativa de fechar (Esc/overlay): só sai quando abrir o caixa com sucesso. */}
      <MoSheet
        open={session === null}
        onOpenChange={() => {}}
        title="Abrir o caixa"
        description="Primeira coisa do dia: informe o fundo de troco pra começar a vender no balcão."
      >
        <label className="block text-sm font-medium text-text-muted">
          Fundo de caixa (R$)
          <input
            className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-lg tabular-nums text-text"
            inputMode="decimal"
            placeholder="0,00"
            value={openAmount}
            onChange={(event) => setOpenAmount(event.target.value)}
            autoFocus
          />
        </label>
        {openError && <p className="mt-2 text-sm text-critical">{openError}</p>}
        <button
          className="mt-4 w-full rounded-[14px] bg-brand px-4 py-3 text-base font-bold text-on-brand disabled:opacity-50"
          disabled={opening}
          onClick={() => void handleOpen()}
        >
          {opening ? 'Abrindo…' : 'Abrir caixa'}
        </button>
      </MoSheet>

      {session && (
        <div className="mb-4 flex items-center justify-between rounded-[12px] border border-border bg-bg-card px-4 py-2">
          <span className="text-sm text-text-muted">
            Caixa aberto · fundo <span className="font-semibold tabular-nums text-text">{centsToBRL(session.openingAmountCents)}</span>
          </span>
          <div className="flex gap-2">
            <button
              className="rounded-[10px] border border-border px-3 py-1.5 text-sm font-semibold text-text"
              onClick={() => setWithdrawOpen(true)}
            >
              Sangria
            </button>
            <button
              className="rounded-[10px] border border-border px-3 py-1.5 text-sm font-semibold text-text"
              onClick={() => setCloseOpen(true)}
            >
              Fechar caixa
            </button>
          </div>
        </div>
      )}

      {session && (
        <WithdrawalSheet
          storeId={storeId}
          sessionId={session.id}
          open={withdrawOpen}
          onOpenChange={setWithdrawOpen}
        />
      )}
      {session && (
        <CloseSessionSheet
          storeId={storeId}
          session={session}
          open={closeOpen}
          onOpenChange={setCloseOpen}
          onClosed={() => {
            setSession(null);
            onSessionChange?.(null);
            setCloseOpen(false);
          }}
        />
      )}
    </>
  );
}

function WithdrawalSheet({
  storeId,
  sessionId,
  open,
  onOpenChange,
}: {
  storeId: string;
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [approvers, setApprovers] = useState<StaffApprover[]>([]);
  const [approverUserId, setApproverUserId] = useState('');
  const [approverPin, setApproverPin] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetchCashApprovers(storeId)
      .then(setApprovers)
      .catch(() => setApprovers([]));
  }, [open, storeId]);

  async function handleSubmit() {
    const cents = parseBRLToCents(amount);
    if (cents === null || cents <= 0) {
      setError('Valor inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      // approverUserId/approverPin vão vazios quando quem pede já auto-aprova
      // (owner/manager) — o SERVIÇO decide se são obrigatórios, o front só
      // oferece os campos pro caso de precisar (cashier).
      await createCashWithdrawal(storeId, sessionId, {
        amountCents: cents,
        reason: reason.trim() || undefined,
        approverUserId: approverUserId || undefined,
        approverPin: approverPin || undefined,
      });
      setAmount('');
      setReason('');
      setApproverUserId('');
      setApproverPin('');
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof CashSessionApiError ? err.message : 'Falha ao registrar a sangria.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MoSheet open={open} onOpenChange={onOpenChange} title="Sangria" description="Retirar dinheiro da gaveta.">
      <label className="block text-sm font-medium text-text-muted">
        Valor (R$)
        <input
          className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-lg tabular-nums text-text"
          inputMode="decimal"
          placeholder="0,00"
          value={amount}
          onChange={(event) => setAmount(event.target.value)}
        />
      </label>
      <label className="mt-3 block text-sm font-medium text-text-muted">
        Motivo (opcional)
        <input
          className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-text"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Troco pro cofre…"
        />
      </label>
      <fieldset className="mt-4 rounded-[12px] border border-border p-3">
        <legend className="px-1 text-xs font-semibold text-text-muted">
          Aprovação do gerente/dono (só se você não puder aprovar sozinho)
        </legend>
        <label className="block text-sm font-medium text-text-muted">
          Quem aprova
          <select
            className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-text"
            value={approverUserId}
            onChange={(event) => setApproverUserId(event.target.value)}
          >
            <option value="">— selecione —</option>
            {approvers.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block text-sm font-medium text-text-muted">
          PIN
          <input
            className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 tabular-nums text-text"
            inputMode="numeric"
            maxLength={6}
            value={approverPin}
            onChange={(event) => setApproverPin(event.target.value)}
            placeholder="••••"
          />
        </label>
      </fieldset>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      <button
        className="mt-4 w-full rounded-[14px] bg-brand px-4 py-3 text-base font-bold text-on-brand disabled:opacity-50"
        disabled={submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? 'Registrando…' : 'Registrar sangria'}
      </button>
    </MoSheet>
  );
}

function CloseSessionSheet({
  storeId,
  session,
  open,
  onOpenChange,
  onClosed,
}: {
  storeId: string;
  session: NonNullable<CurrentCashSessionResponse>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onClosed: () => void;
}) {
  const [counted, setCounted] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    const cents = parseBRLToCents(counted);
    if (cents === null) {
      setError('Valor inválido.');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await closeCashSession(storeId, session.id, cents);
      setCounted('');
      onClosed();
    } catch (err) {
      setError(err instanceof CashSessionApiError ? err.message : 'Falha ao fechar o caixa.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <MoSheet open={open} onOpenChange={onOpenChange} title="Fechar caixa" description="Conte o dinheiro da gaveta e informe o total.">
      <p className="text-sm text-text-muted">
        Fundo de abertura: <span className="font-semibold tabular-nums text-text">{centsToBRL(session.openingAmountCents)}</span>
      </p>
      <label className="mt-3 block text-sm font-medium text-text-muted">
        Valor contado na gaveta (R$)
        <input
          className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-lg tabular-nums text-text"
          inputMode="decimal"
          placeholder="0,00"
          value={counted}
          onChange={(event) => setCounted(event.target.value)}
          autoFocus
        />
      </label>
      {error && <p className="mt-2 text-sm text-critical">{error}</p>}
      <button
        className="mt-4 w-full rounded-[14px] bg-brand px-4 py-3 text-base font-bold text-on-brand disabled:opacity-50"
        disabled={submitting}
        onClick={() => void handleSubmit()}
      >
        {submitting ? 'Fechando…' : 'Fechar caixa'}
      </button>
    </MoSheet>
  );
}
