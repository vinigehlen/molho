'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Percent } from 'lucide-react';
import { MoButton, MoChip, MoChipGroup, MoEmptyState, MoInput } from '@molho/ui';
import { fetchCategories, fetchProducts, type Category, type Product } from '../../../lib/catalog-api';
import {
  createPromotion,
  deletePromotion,
  fetchPromotions,
  setPromotionActive,
  type Promotion,
  type PromotionDiscountType,
  type PromotionScope,
} from '../../../lib/promotions-api';

interface Draft {
  name: string;
  discountType: PromotionDiscountType;
  discountValue: string; // percent (1-100) ou reais, conforme discountType
  weekdays: number[];
  startTime: string; // HH:MM
  endTime: string; // HH:MM
  scope: PromotionScope;
  categoryId: string;
  productId: string;
}

const EMPTY_DRAFT: Draft = {
  name: '',
  discountType: 'percent',
  discountValue: '',
  weekdays: [0, 1, 2, 3, 4, 5, 6],
  startTime: '00:00',
  endTime: '23:59',
  scope: 'store_wide',
  categoryId: '',
  productId: '',
};

const WEEKDAY_LABEL = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function reaisToCents(value: string): number {
  const normalized = value.replace(/[^\d,.-]/g, '').replace(',', '.');
  return Math.max(0, Math.round(Number(normalized || '0') * 100));
}

function describeDiscount(promotion: Promotion): string {
  if (promotion.discountType === 'percent') return `${promotion.discountValue}% off`;
  return `${(promotion.discountValue / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} off`;
}

function describeScope(promotion: Promotion, categories: Category[], products: Product[]): string {
  if (promotion.scope === 'store_wide') return 'Loja toda';
  if (promotion.scope === 'category') return categories.find((c) => c.id === promotion.scopeId)?.name ?? 'Categoria removida';
  return products.find((p) => p.id === promotion.scopeId)?.name ?? 'Produto removido';
}

function describeWeekdays(weekdays: number[]): string {
  if (weekdays.length === 7) return 'Todos os dias';
  return [...weekdays].sort().map((d) => WEEKDAY_LABEL[d]).join(', ');
}

export default function PromocoesPage() {
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    Promise.all([
      fetchPromotions(),
      fetchCategories().then(async (cats) => {
        const byCategory = await Promise.all(cats.map(({ id }) => fetchProducts(id)));
        return { cats, prods: byCategory.flat() };
      }),
    ])
      .then(([promotionData, { cats, prods }]) => {
        if (!vivo) return;
        setPromotions(promotionData);
        setCategories(cats);
        setProducts(prods);
      })
      .catch(() => {
        if (vivo) setError('Não deu pra carregar as promoções.');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  function toggleWeekday(day: number) {
    setDraft((d) => ({
      ...d,
      weekdays: d.weekdays.includes(day) ? d.weekdays.filter((w) => w !== day) : [...d.weekdays, day].sort(),
    }));
  }

  async function handleCreate() {
    setFormError(null);
    if (!draft.name.trim()) return setFormError('Informe um nome pra promoção.');
    if (draft.weekdays.length === 0) return setFormError('Selecione ao menos um dia da semana.');
    if (draft.startTime === draft.endTime) return setFormError('Início e fim não podem ser iguais.');
    if (draft.scope !== 'store_wide' && !draft.categoryId) return setFormError('Selecione a categoria.');
    if (draft.scope === 'product' && !draft.productId) return setFormError('Selecione o produto.');

    const discountValue = Number(draft.discountValue.replace(',', '.'));
    if (draft.discountType === 'percent' && (!Number.isInteger(discountValue) || discountValue < 1 || discountValue > 100)) {
      return setFormError('O percentual precisa ser um número inteiro entre 1 e 100.');
    }
    if (draft.discountType === 'fixed' && discountValue <= 0) {
      return setFormError('Informe um valor de desconto maior que zero.');
    }

    setSaving(true);
    try {
      const created = await createPromotion({
        name: draft.name.trim(),
        discountType: draft.discountType,
        discountValue: draft.discountType === 'percent' ? discountValue : reaisToCents(draft.discountValue),
        weekdays: draft.weekdays,
        startTime: draft.startTime,
        endTime: draft.endTime,
        scope: draft.scope,
        ...(draft.scope === 'category' ? { scopeId: draft.categoryId } : {}),
        ...(draft.scope === 'product' ? { scopeId: draft.productId } : {}),
      });
      setPromotions((prev) => [created, ...prev]);
      setDraft(EMPTY_DRAFT);
      setCreateOpen(false);
    } catch {
      setFormError('Não deu pra criar a promoção. Confere os dados e tenta de novo.');
    } finally {
      setSaving(false);
    }
  }

  async function handleToggleActive(promotion: Promotion) {
    setBusyId(promotion.id);
    try {
      const updated = await setPromotionActive(promotion, !promotion.active);
      setPromotions((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch {
      setError('Não deu pra atualizar a promoção. Tenta de novo.');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(promotion: Promotion) {
    setBusyId(promotion.id);
    try {
      await deletePromotion(promotion);
      setPromotions((prev) => prev.filter((p) => p.id !== promotion.id));
    } catch {
      setError('Não deu pra remover a promoção. Tenta de novo.');
    } finally {
      setBusyId(null);
    }
  }

  const categoryProducts = products.filter((p) => p.categoryId === draft.categoryId);

  return (
    <main className="flex flex-col gap-6 p-6">
      <header className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-title-lg text-text">Promoções</h1>
          <p className="text-body text-text-muted">Descontos automáticos aplicados no carrinho — sem código, sem o cliente pedir nada.</p>
        </div>
        <MoButton onClick={() => setCreateOpen((v) => !v)}>{createOpen ? 'Cancelar' : 'Nova promoção'}</MoButton>
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
            label="Nome"
            value={draft.name}
            onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, name: value })); }}
            placeholder="Happy hour"
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
            placeholder={draft.discountType === 'percent' ? '20' : '5,00'}
          />
          <MoChipGroup label="Alcance">
            <MoChip selected={draft.scope === 'store_wide'} onClick={() => setDraft((d) => ({ ...d, scope: 'store_wide', categoryId: '', productId: '' }))}>
              Loja toda
            </MoChip>
            <MoChip selected={draft.scope === 'category'} onClick={() => setDraft((d) => ({ ...d, scope: 'category', productId: '' }))}>
              Categoria
            </MoChip>
            <MoChip selected={draft.scope === 'product'} onClick={() => setDraft((d) => ({ ...d, scope: 'product' }))}>
              Produto
            </MoChip>
          </MoChipGroup>
          {draft.scope !== 'store_wide' ? (
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Categoria
              <select
                aria-label="Categoria alvo"
                className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text"
                value={draft.categoryId}
                onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, categoryId: value, productId: '' })); }}
              >
                <option value="">Selecione</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>{category.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          {draft.scope === 'product' && draft.categoryId ? (
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Produto
              <select
                aria-label="Produto alvo"
                className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text"
                value={draft.productId}
                onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, productId: value })); }}
              >
                <option value="">Selecione</option>
                {categoryProducts.map((product) => (
                  <option key={product.id} value={product.id}>{product.name}</option>
                ))}
              </select>
            </label>
          ) : null}
          <MoChipGroup label="Dias da semana">
            {WEEKDAY_LABEL.map((label, day) => (
              <MoChip key={label} selected={draft.weekdays.includes(day)} onClick={() => toggleWeekday(day)}>
                {label}
              </MoChip>
            ))}
          </MoChipGroup>
          <div className="grid grid-cols-2 gap-4">
            <MoInput
              label="Início"
              type="time"
              value={draft.startTime}
              onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, startTime: value })); }}
            />
            <MoInput
              label="Fim"
              type="time"
              value={draft.endTime}
              onChange={(e) => { const value = e.currentTarget.value; setDraft((d) => ({ ...d, endTime: value })); }}
            />
          </div>
          {formError ? <p className="text-caption font-semibold text-critical-strong">{formError}</p> : null}
          <MoButton onClick={() => void handleCreate()} loading={saving}>
            Criar promoção
          </MoButton>
        </div>
      ) : null}

      {loading ? (
        <p className="text-body text-text-muted">Carregando promoções…</p>
      ) : promotions.length === 0 ? (
        <MoEmptyState
          title="Nenhuma promoção ainda"
          description="Crie um desconto automático que aplica sozinho no carrinho, sem o cliente digitar código."
          action={{ label: 'Nova promoção', onClick: () => setCreateOpen(true) }}
        />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-card">
          {promotions.map((promotion) => (
            <div key={promotion.id} className="flex items-center justify-between gap-4 p-4">
              <div className="flex items-center gap-3">
                <Percent className="h-5 w-5 shrink-0 text-brand-strong" aria-hidden="true" />
                <div className="flex flex-col gap-0.5">
                  <span className="text-body-strong tnum text-text">{promotion.name}</span>
                  <span className="text-caption text-text-muted">
                    {describeDiscount(promotion)} · {describeScope(promotion, categories, products)}
                  </span>
                  <span className="text-caption text-text-muted">
                    {describeWeekdays(promotion.weekdays)} · {promotion.startTime}–{promotion.endTime}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MoButton
                  variant="secondary"
                  size="sm"
                  loading={busyId === promotion.id}
                  onClick={() => void handleToggleActive(promotion)}
                >
                  {promotion.active ? 'Pausar' : 'Ativar'}
                </MoButton>
                <MoButton
                  variant="ghost"
                  size="sm"
                  loading={busyId === promotion.id}
                  onClick={() => void handleDelete(promotion)}
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
