'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Ticket } from 'lucide-react';
import { MoButton, MoChip, MoChipGroup, MoEmptyState, MoInput, formatCents } from '@molho/ui';
import {
  createCoupon,
  deleteCoupon,
  fetchCoupons,
  setCouponActive,
  type Coupon,
  type CouponDiscountType,
} from '../../../lib/coupons-api';

interface Draft {
  code: string;
  discountType: CouponDiscountType;
  discountValue: string; // percent (1-100) ou reais, conforme discountType
  minOrder: string; // reais
  startsAt: string; // datetime-local
  endsAt: string; // datetime-local
  maxUses: string;
}

const EMPTY_DRAFT: Draft = {
  code: '',
  discountType: 'percent',
  discountValue: '',
  minOrder: '0',
  startsAt: '',
  endsAt: '',
  maxUses: '100',
};

function reaisToCents(value: string): number {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(',', '.');
  return Math.max(0, Math.round(Number(normalized || '0') * 100));
}

function describeDiscount(coupon: Coupon): string {
  if (coupon.discountType === 'percent') return `${coupon.discountPercent}% off`;
  return `${formatCents(coupon.discountValueCents ?? 0)} off`;
}

export default function CuponsPage() {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchCoupons()
      .then((data) => {
        if (vivo) setCoupons(data);
      })
      .catch(() => {
        if (vivo) setError('Não deu pra carregar os cupons.');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function handleCreate() {
    setFormError(null);
    if (!draft.code.trim()) return setFormError('Informe um código pro cupom.');
    if (!draft.startsAt || !draft.endsAt) return setFormError('Informe início e fim da validade.');
    if (new Date(draft.startsAt) >= new Date(draft.endsAt)) return setFormError('O início precisa ser antes do fim.');
    const maxUses = Number(draft.maxUses);
    if (!Number.isInteger(maxUses) || maxUses < 1) return setFormError('O limite de usos precisa ser um número maior que zero.');

    const discountValue = Number(draft.discountValue.replace(',', '.'));
    if (draft.discountType === 'percent' && (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > 100)) {
      return setFormError('O percentual precisa ser um número inteiro entre 1 e 100.');
    }
    if (draft.discountType === 'fixed' && discountValue <= 0) {
      return setFormError('Informe um valor de desconto maior que zero.');
    }

    setSaving(true);
    try {
      const created = await createCoupon({
        code: draft.code.trim().toUpperCase(),
        discountType: draft.discountType,
        ...(draft.discountType === 'percent' ? { discountPercent: discountValue } : { discountValueCents: reaisToCents(draft.discountValue) }),
        minOrderCents: reaisToCents(draft.minOrder),
        startsAt: new Date(draft.startsAt).toISOString(),
        endsAt: new Date(draft.endsAt).toISOString(),
        maxUses,
      });
      setCoupons((prev) => [created, ...prev]);
      setDraft(EMPTY_DRAFT);
      setCreateOpen(false);
    } catch {
      setFormError('Não deu pra criar o cupom. Confere se o código já não existe.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(coupon: Coupon) {
    setBusyId(coupon.id);
    try {
      const updated = await setCouponActive(coupon, !coupon.active);
      setCoupons((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
    } catch {
      setError('Não deu pra atualizar o cupom. Tenta de novo.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(coupon: Coupon) {
    setBusyId(coupon.id);
    try {
      await deleteCoupon(coupon);
      setCoupons((prev) => prev.filter((c) => c.id !== coupon.id));
    } catch {
      setError('Não deu pra remover o cupom. Tenta de novo.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title-lg text-text">Cupons</h1>
          <p className="text-body text-text-muted">Códigos de desconto que o cliente aplica no carrinho.</p>
        </div>
        <MoButton onClick={() => setCreateOpen((v) => !v)}>{createOpen ? 'Cancelar' : 'Novo cupom'}</MoButton>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {createOpen ? (
        <div className="flex flex-col gap-4 rounded-lg border border-border bg-bg-card p-4">
          <MoInput
            label="Código"
            value={draft.code}
            onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, code: value })); }}
            placeholder="PRIMEIRACOMPRA"
          />
          <MoChipGroup label="Tipo de desconto">
            <MoChip selected={draft.discountType === 'percent'} onClick={() => setDraft((d) => ({ ...d, discountType: 'percent', discountValue: '' }))}>
              Percentual
            </MoChip>
            <MoChip selected={draft.discountType === 'fixed'} onClick={() => setDraft((d) => ({ ...d, discountType: 'fixed', discountValue: '' }))}>
              Valor fixo
            </MoChip>
          </MoChipGroup>
          <MoInput
            label={draft.discountType === 'percent' ? 'Percentual de desconto (1-100)' : 'Valor do desconto (R$)'}
            inputMode="numeric"
            value={draft.discountValue}
            onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, discountValue: value })); }}
            placeholder={draft.discountType === 'percent' ? '10' : '15,00'}
          />
          <MoInput
            label="Pedido mínimo (R$)"
            inputMode="numeric"
            value={draft.minOrder}
            onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, minOrder: value })); }}
          />
          <div className="grid grid-cols-2 gap-4">
            <MoInput
              label="Válido a partir de"
              type="datetime-local"
              value={draft.startsAt}
              onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, startsAt: value })); }}
            />
            <MoInput
              label="Válido até"
              type="datetime-local"
              value={draft.endsAt}
              onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, endsAt: value })); }}
            />
          </div>
          <MoInput
            label="Limite de usos"
            inputMode="numeric"
            value={draft.maxUses}
            onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, maxUses: value })); }}
          />
          {formError ? <p className="text-caption font-semibold text-critical-strong">{formError}</p> : null}
          <MoButton onClick={() => void handleCreate()} loading={saving}>
            Criar cupom
          </MoButton>
        </div>
      ) : null}

      {loading ? (
        <p className="text-body text-text-muted">Carregando cupons…</p>
      ) : coupons.length === 0 ? (
        <MoEmptyState
          title="Nenhum cupom ainda"
          description="Crie um código de desconto pro cliente aplicar no carrinho."
          action={{ label: 'Novo cupom', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-card">
          {coupons.map((coupon) => (
            <div key={coupon.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Ticket className="h-5 w-5 shrink-0 text-brand-strong" aria-hidden="true" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-body-strong tnum text-text">{coupon.code}</span>
                  <span className="text-caption text-text-muted">
                    {describeDiscount(coupon)} · mín. {formatCents(coupon.minOrderCents)} · {coupon.usesCount}/{coupon.maxUses} usos
                  </span>
                  <span className="text-caption text-text-muted">
                    válido {new Date(coupon.startsAt).toLocaleDateString('pt-BR')} até {new Date(coupon.endsAt).toLocaleDateString('pt-BR')}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MoButton
                  variant="secondary"
                  size="sm"
                  loading={busyId === coupon.id}
                  onClick={() => void handleToggleActive(coupon)}
                >
                  {coupon.active ? 'Pausar' : 'Ativar'}
                </MoButton>
                <MoButton
                  variant="ghost"
                  size="sm"
                  loading={busyId === coupon.id}
                  onClick={() => void handleDelete(coupon)}
                >
                  Remover
                </MoButton>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
