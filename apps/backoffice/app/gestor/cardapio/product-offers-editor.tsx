'use client';

import { MoBadge, MoButton, cn } from '@molho/ui';
import { Plus, Save, Trash2, X } from 'lucide-react';
import React, { useEffect, useMemo, useState } from 'react';
import {
  createProductOffer,
  deleteProductOffer,
  fetchProductOffers,
  setProductOfferAvailability,
  updateProductOffer,
  type Category,
  type ComboPricingMode,
  type Product,
  type ProductOffer,
} from '../../../lib/catalog-api';
import { brlToCents, centsToBRL } from '../../../lib/format';

const FIELD_CLASS =
  'h-11 w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm outline-none transition-colors placeholder:text-text-muted focus-visible:border-brand focus-visible:shadow-focus';

function isMoneyDraftValid(value: string): boolean {
  return /\d/.test(value) && Number.isSafeInteger(brlToCents(value));
}

function isSortOrderDraftValid(value: string): boolean {
  return /^-?\d+$/.test(value.trim()) && Number.isSafeInteger(Number(value));
}

interface PrimaryOfferDraft {
  categoryId: string;
  price: string;
  pdvCode: string;
}

interface ProductOffersEditorProps {
  product: Product;
  categories: Category[];
  primaryDraft: PrimaryOfferDraft;
}

/**
 * Edição progressiva dentro do inspetor atual: identidade do item continua
 * única, enquanto cada categoria ganha sua própria apresentação comercial.
 * A oferta principal é editada pelos campos legados logo acima; apenas as
 * secundárias usam a API de ProductOffer diretamente nesta expansão.
 */
export function ProductOffersEditor({
  product,
  categories,
  primaryDraft,
}: ProductOffersEditorProps) {
  const [offers, setOffers] = useState<ProductOffer[]>([]);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [primaryPricingBusy, setPrimaryPricingBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState({
    categoryId: '',
    price: '',
    comboPricingMode: 'fixed' as ComboPricingMode,
    pdvCode: '',
    sortOrder: '0',
  });

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    fetchProductOffers(product.id)
      .then((loaded) => {
        if (active) setOffers(loaded);
      })
      .catch((cause) => {
        if (active) {
          setError(
            cause instanceof Error
              ? cause.message
              : 'Não foi possível carregar onde este item aparece.',
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [product.id, product.version]);

  const usedCategoryIds = useMemo(
    () =>
      new Set([
        product.categoryId,
        primaryDraft.categoryId,
        ...offers.map((offer) => offer.categoryId),
      ]),
    [offers, primaryDraft.categoryId, product.categoryId],
  );
  const availableCategories = categories.filter((category) => !usedCategoryIds.has(category.id));
  const primaryOffer = offers.find((offer) => offer.isPrimary);
  const secondary = offers.filter((offer) => !offer.isPrimary);
  const isComboProduct = product.kind === 'combo';

  function openCreation() {
    const first = availableCategories[0];
    if (!first) return;
    setDraft({
      categoryId: first.id,
      price: primaryDraft.price,
      comboPricingMode: 'fixed',
      pdvCode: primaryDraft.pdvCode,
      sortOrder: '0',
    });
    setAdding(true);
    setError(null);
    setMessage(null);
  }

  async function addOffer() {
    if (
      !draft.categoryId ||
      !isMoneyDraftValid(draft.price) ||
      !isSortOrderDraftValid(draft.sortOrder)
    )
      return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const created = await createProductOffer({
        productId: product.id,
        categoryId: draft.categoryId,
        priceCents: brlToCents(draft.price),
        ...(isComboProduct ? { comboPricingMode: draft.comboPricingMode } : {}),
        pdvCode: draft.pdvCode.trim() || null,
        sortOrder: Number(draft.sortOrder),
      });
      setOffers((current) => [...current, created]);
      setAdding(false);
      setMessage('Item adicionado em mais uma categoria.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a categoria.');
    } finally {
      setBusy(false);
    }
  }

  function replaceOffer(updated: ProductOffer) {
    setOffers((current) => current.map((offer) => (offer.id === updated.id ? updated : offer)));
  }

  async function updatePrimaryPricingMode(comboPricingMode: ComboPricingMode) {
    if (!primaryOffer) return;
    setPrimaryPricingBusy(true);
    setError(null);
    setMessage(null);
    try {
      replaceOffer(await updateProductOffer(primaryOffer, { comboPricingMode }));
      setMessage('Modo de preço do combo atualizado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o modo de preço.');
    } finally {
      setPrimaryPricingBusy(false);
    }
  }

  return (
    <section className="mt-6 border-t border-border pt-6" aria-labelledby="offers-title">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h4 id="offers-title" className="font-semibold">
            Disponível em
          </h4>
          <p className="mt-1 max-w-xl text-sm text-text-muted">
            Use o mesmo item em outras categorias, com preço, PDV e disponibilidade próprios.
          </p>
        </div>
        <MoBadge variant="neutral">
          {Math.max(1, offers.length)} {offers.length <= 1 ? 'categoria' : 'categorias'}
        </MoBadge>
      </div>

      {error && (
        <p
          role="alert"
          className="mt-3 rounded-[14px] bg-critical/10 px-3 py-2 text-sm text-critical"
        >
          {error}
        </p>
      )}
      {message && (
        <p
          role="status"
          className="mt-3 rounded-[14px] bg-positive/10 px-3 py-2 text-sm text-positive"
        >
          {message}
        </p>
      )}

      {loading ? (
        <div className="mt-4 grid gap-2" aria-label="Carregando categorias do item">
          <div className="h-20 animate-pulse rounded-[14px] bg-border/60" />
          <div className="h-20 animate-pulse rounded-[14px] bg-border/40" />
        </div>
      ) : (
        <div className="mt-4 grid gap-3">
          <div className="rounded-[14px] border border-brand/30 bg-brand-faint p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold">
                    {categories.find((category) => category.id === primaryDraft.categoryId)?.name ??
                      'Categoria principal'}
                  </p>
                  <MoBadge className="bg-brand text-on-brand">Principal</MoBadge>
                </div>
                <p className="mt-1 text-sm text-text-muted">
                  {isMoneyDraftValid(primaryDraft.price)
                    ? centsToBRL(brlToCents(primaryDraft.price))
                    : primaryDraft.price || 'Preço pendente'}
                  {primaryDraft.pdvCode.trim()
                    ? ` · PDV ${primaryDraft.pdvCode.trim()}`
                    : ' · sem código PDV'}
                </p>
                {isComboProduct && primaryOffer ? (
                  <div className="mt-3 max-w-xs">
                    <PricingModeSelect
                      id={`combo-pricing-${primaryOffer.id}`}
                      label="Modo de preço"
                      value={primaryOffer.comboPricingMode}
                      disabled={primaryPricingBusy}
                      onChange={(comboPricingMode) => void updatePrimaryPricingMode(comboPricingMode)}
                    />
                  </div>
                ) : null}
              </div>
              <MoBadge variant={product.available ? 'positive' : 'neutral'}>
                {product.available ? 'À venda' : 'Esgotado'}
              </MoBadge>
            </div>
            <p className="mt-2 text-xs text-text-muted">
              Categoria, preço e PDV principais são salvos junto com o item nesta etapa.
            </p>
          </div>

          {secondary.map((offer) => (
            <SecondaryOfferCard
              key={offer.id}
              offer={offer}
              categories={categories}
              isComboProduct={isComboProduct}
              usedCategoryIds={usedCategoryIds}
              onUpdated={replaceOffer}
              onDeleted={(id) => setOffers((current) => current.filter((item) => item.id !== id))}
            />
          ))}

          {adding ? (
            <div className="rounded-[14px] border border-brand/40 bg-bg-card p-4">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold">Nova categoria</p>
                <button
                  type="button"
                  aria-label="Cancelar nova categoria"
                  className="flex h-11 w-11 items-center justify-center rounded-[14px] text-text-muted hover:bg-bg"
                  onClick={() => setAdding(false)}
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
                  Categoria
                  <select
                    aria-label="Nova categoria da apresentação"
                    className={FIELD_CLASS}
                    value={draft.categoryId}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, categoryId: event.target.value }))
                    }
                  >
                    {availableCategories.map((category) => (
                      <option key={category.id} value={category.id}>
                        {category.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Preço
                  <input
                    aria-label="Preço da nova apresentação"
                    inputMode="decimal"
                    className={cn(FIELD_CLASS, 'tabular-nums')}
                    value={draft.price}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, price: event.target.value }))
                    }
                  />
                </label>
                <label className="grid gap-1.5 text-sm font-semibold">
                  Código no PDV <span className="font-normal text-text-muted">(opcional)</span>
                  <input
                    aria-label="Código PDV da nova apresentação"
                    className={FIELD_CLASS}
                    maxLength={60}
                    value={draft.pdvCode}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, pdvCode: event.target.value }))
                    }
                  />
                </label>
                {isComboProduct ? (
                  <PricingModeSelect
                    id="new-offer-combo-pricing"
                    label="Modo de preço do combo"
                    value={draft.comboPricingMode}
                    disabled={busy}
                    onChange={(comboPricingMode) =>
                      setDraft((current) => ({ ...current, comboPricingMode }))
                    }
                  />
                ) : null}
                <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
                  Ordem na categoria
                  <input
                    aria-label="Ordem da nova apresentação na categoria"
                    type="number"
                    inputMode="numeric"
                    step="1"
                    className={cn(FIELD_CLASS, 'tabular-nums')}
                    value={draft.sortOrder}
                    onChange={(event) =>
                      setDraft((current) => ({ ...current, sortOrder: event.target.value }))
                    }
                  />
                  <span className="font-normal text-text-muted">
                    Números menores aparecem primeiro.
                  </span>
                </label>
              </div>
              <MoButton
                type="button"
                className="mt-4 w-full"
                disabled={
                  busy ||
                  !draft.categoryId ||
                  !isMoneyDraftValid(draft.price) ||
                  !isSortOrderDraftValid(draft.sortOrder)
                }
                onClick={() => void addOffer()}
              >
                {busy ? 'Adicionando…' : 'Adicionar nesta categoria'}
              </MoButton>
            </div>
          ) : (
            <button
              type="button"
              className="flex min-h-11 items-center justify-center gap-2 rounded-[14px] border border-dashed border-border px-4 text-sm font-semibold text-brand transition-colors hover:border-brand focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:text-text-muted"
              disabled={availableCategories.length === 0}
              onClick={openCreation}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              {availableCategories.length > 0
                ? 'Adicionar em outra categoria'
                : 'Já aparece em todas as categorias'}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function SecondaryOfferCard({
  offer,
  categories,
  isComboProduct,
  usedCategoryIds,
  onUpdated,
  onDeleted,
}: {
  offer: ProductOffer;
  categories: Category[];
  isComboProduct: boolean;
  usedCategoryIds: Set<string>;
  onUpdated: (offer: ProductOffer) => void;
  onDeleted: (id: string) => void;
}) {
  const [draft, setDraft] = useState({
    categoryId: offer.categoryId,
    price: centsToBRL(offer.priceCents),
    comboPricingMode: offer.comboPricingMode,
    pdvCode: offer.pdvCode ?? '',
    sortOrder: String(offer.sortOrder),
  });
  const [busy, setBusy] = useState<'save' | 'availability' | 'delete' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  useEffect(() => {
    setDraft({
      categoryId: offer.categoryId,
      price: centsToBRL(offer.priceCents),
      comboPricingMode: offer.comboPricingMode,
      pdvCode: offer.pdvCode ?? '',
      sortOrder: String(offer.sortOrder),
    });
  }, [offer]);

  const categoryOptions = categories.filter(
    (category) => category.id === offer.categoryId || !usedCategoryIds.has(category.id),
  );
  const categoryName =
    categories.find((category) => category.id === offer.categoryId)?.name ?? 'Outra categoria';

  async function save() {
    if (
      !draft.categoryId ||
      !isMoneyDraftValid(draft.price) ||
      !isSortOrderDraftValid(draft.sortOrder)
    )
      return;
    setBusy('save');
    setError(null);
    try {
      onUpdated(
        await updateProductOffer(offer, {
          categoryId: draft.categoryId,
          priceCents: brlToCents(draft.price),
          ...(isComboProduct ? { comboPricingMode: draft.comboPricingMode } : {}),
          pdvCode: draft.pdvCode.trim() || null,
          sortOrder: Number(draft.sortOrder),
        }),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a apresentação.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleAvailability() {
    setBusy('availability');
    setError(null);
    try {
      onUpdated(await setProductOfferAvailability(offer, !offer.available));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível mudar a disponibilidade.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function remove() {
    setBusy('delete');
    setError(null);
    try {
      await deleteProductOffer(offer);
      onDeleted(offer.id);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a apresentação.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <article className="rounded-[14px] border border-border bg-bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-semibold">{categoryName}</p>
          <p className="mt-0.5 text-xs text-text-muted">Apresentação independente</p>
        </div>
        <button
          type="button"
          aria-label={`${offer.available ? 'Marcar como esgotado' : 'Colocar à venda'} em ${categoryName}`}
          aria-pressed={offer.available}
          disabled={busy !== null}
          className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-pill px-1 focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-wait disabled:bg-disabled-surface disabled:text-disabled-text"
          onClick={() => void toggleAvailability()}
        >
          <MoBadge variant={offer.available ? 'positive' : 'neutral'}>
            {offer.available ? 'À venda' : 'Esgotado'}
          </MoBadge>
        </button>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
          Categoria
          <select
            aria-label={`Categoria da apresentação em ${categoryName}`}
            className={FIELD_CLASS}
            value={draft.categoryId}
            onChange={(event) =>
              setDraft((current) => ({ ...current, categoryId: event.target.value }))
            }
          >
            {categoryOptions.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Preço
          <input
            aria-label={`Preço em ${categoryName}`}
            inputMode="decimal"
            className={cn(FIELD_CLASS, 'tabular-nums')}
            value={draft.price}
            onChange={(event) => setDraft((current) => ({ ...current, price: event.target.value }))}
          />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold">
          Código no PDV <span className="font-normal text-text-muted">(opcional)</span>
          <input
            aria-label={`Código PDV em ${categoryName}`}
            className={FIELD_CLASS}
            maxLength={60}
            value={draft.pdvCode}
            onChange={(event) =>
              setDraft((current) => ({ ...current, pdvCode: event.target.value }))
            }
          />
        </label>
        {isComboProduct ? (
          <PricingModeSelect
            id={`combo-pricing-${offer.id}`}
            label="Modo de preço do combo"
            value={draft.comboPricingMode}
            disabled={busy !== null}
            onChange={(comboPricingMode) =>
              setDraft((current) => ({ ...current, comboPricingMode }))
            }
          />
        ) : null}
        <label className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
          Ordem na categoria
          <input
            aria-label={`Ordem em ${categoryName}`}
            type="number"
            inputMode="numeric"
            step="1"
            className={cn(FIELD_CLASS, 'tabular-nums')}
            value={draft.sortOrder}
            onChange={(event) =>
              setDraft((current) => ({ ...current, sortOrder: event.target.value }))
            }
          />
          <span className="font-normal text-text-muted">Números menores aparecem primeiro.</span>
        </label>
      </div>

      {error && (
        <p role="alert" className="mt-3 text-sm text-critical">
          {error}
        </p>
      )}

      {confirmingDelete ? (
        <div className="mt-4 rounded-[14px] border border-critical/30 bg-critical/10 p-3">
          <p className="text-sm font-semibold text-critical-strong">Remover de {categoryName}?</p>
          <p className="mt-1 text-sm text-text-muted">
            O item continua disponível nas outras categorias.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2">
            <MoButton
              type="button"
              variant="ghost"
              size="sm"
              disabled={busy !== null}
              onClick={() => setConfirmingDelete(false)}
            >
              Manter categoria
            </MoButton>
            <MoButton
              type="button"
              variant="danger"
              size="sm"
              loading={busy === 'delete'}
              onClick={() => void remove()}
            >
              Remover categoria
            </MoButton>
          </div>
        </div>
      ) : (
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-[14px] border border-border px-3 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-focus disabled:bg-disabled-surface disabled:text-disabled-text"
            disabled={
              busy !== null ||
              !isMoneyDraftValid(draft.price) ||
              !isSortOrderDraftValid(draft.sortOrder)
            }
            onClick={() => void save()}
          >
            <Save className="h-4 w-4" aria-hidden="true" />
            {busy === 'save' ? 'Salvando…' : 'Salvar apresentação'}
          </button>
          <button
            type="button"
            aria-label={`Remover apresentação em ${categoryName}`}
            className="inline-flex h-11 w-11 items-center justify-center rounded-[14px] border border-critical/40 text-critical focus-visible:outline-none focus-visible:shadow-focus disabled:bg-disabled-surface disabled:text-disabled-text"
            disabled={busy !== null}
            onClick={() => setConfirmingDelete(true)}
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
    </article>
  );
}

function PricingModeSelect({
  id,
  label,
  value,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  value: ComboPricingMode;
  disabled: boolean;
  onChange: (value: ComboPricingMode) => void;
}) {
  return (
    <label htmlFor={id} className="grid gap-1.5 text-sm font-semibold sm:col-span-2">
      {label}
      <select
        id={id}
        className={FIELD_CLASS}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value as ComboPricingMode)}
      >
        <option value="fixed">Preço fixo</option>
        <option value="sum_of_items">Somar itens do combo</option>
      </select>
    </label>
  );
}
