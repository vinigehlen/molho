'use client';

import { MoButton, cn } from '@molho/ui';
import { Plus, Trash2 } from 'lucide-react';
import React, { useEffect, useState } from 'react';
import {
  createComboItem,
  deleteComboItem,
  fetchComboItems,
  fetchProducts,
  updateComboItem,
  type Category,
  type ComboItem,
  type Product,
} from '../../../lib/catalog-api';

const FIELD_CLASS =
  'h-11 w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm outline-none transition-colors placeholder:text-text-muted focus-visible:border-brand focus-visible:shadow-focus';

interface ComboItemsEditorProps {
  comboProductId: string;
  categories: Category[];
}

/**
 * Composição do combo (exceção MVP 2026-08-28, fase 4.1a). Só aparece quando
 * o item é do tipo Combo. Preço fixo (o da oferta do combo) — os filhos aqui
 * definem o que vem dentro, não o preço. Sem combo aninhado.
 */
export function ComboItemsEditor({ comboProductId, categories }: ComboItemsEditorProps) {
  const [items, setItems] = useState<ComboItem[]>([]);
  const [catalog, setCatalog] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [childId, setChildId] = useState('');
  const [quantity, setQuantity] = useState('1');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    Promise.all([
      fetchComboItems(comboProductId),
      Promise.all(categories.map((category) => fetchProducts(category.id))),
    ])
      .then(([loadedItems, perCategory]) => {
        if (!active) return;
        setItems(loadedItems);
        setCatalog(perCategory.flat());
      })
      .catch((cause) => {
        if (active) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o combo.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [comboProductId, categories]);

  const usedChildIds = new Set(items.map((item) => item.childProductId));
  const selectable = catalog.filter(
    (product) =>
      product.id !== comboProductId &&
      product.kind !== 'combo' &&
      !usedChildIds.has(product.id),
  );

  async function addItem() {
    const qty = Number(quantity);
    if (!childId || !Number.isInteger(qty) || qty < 1) return;
    setBusy('add');
    setError(null);
    setMessage(null);
    try {
      const created = await createComboItem({ comboProductId, childProductId: childId, quantity: qty });
      setItems((prev) => [...prev, created]);
      setChildId('');
      setQuantity('1');
      setMessage('Item adicionado ao combo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o item.');
    } finally {
      setBusy(null);
    }
  }

  async function changeQuantity(item: ComboItem, next: number) {
    if (!Number.isInteger(next) || next < 1) return;
    setBusy(item.id);
    setError(null);
    try {
      const updated = await updateComboItem(item, { quantity: next });
      setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a quantidade.');
    } finally {
      setBusy(null);
    }
  }

  async function changeRemovable(item: ComboItem, removable: boolean) {
    setBusy(item.id);
    setError(null);
    try {
      const updated = await updateComboItem(item, { removable });
      setItems((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a remoção do item.');
    } finally {
      setBusy(null);
    }
  }

  async function removeItem(item: ComboItem) {
    if (!window.confirm(`Remover "${item.childName}" do combo?`)) return;
    setBusy(item.id);
    setError(null);
    try {
      await deleteComboItem(item);
      setItems((prev) => prev.filter((row) => row.id !== item.id));
      setMessage('Item removido do combo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover o item.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="mt-5">
      <p className="font-semibold">Itens do combo</p>
      <p className="text-sm text-text-muted">
        Escolha os produtos que vêm dentro. O preço do combo é o definido acima — a lista aqui
        controla só o que o cliente recebe.
      </p>

      {error && <p className="mt-2 text-sm text-critical-strong">{error}</p>}
      {message && <p className="mt-2 text-sm text-text-muted">{message}</p>}

      {loading ? (
        <p className="mt-3 text-sm text-text-muted">Carregando…</p>
      ) : (
        <>
          <ul className="mt-3 grid gap-2">
            {items.length === 0 && (
              <li className="text-sm text-text-muted">Nenhum item ainda. Adicione o primeiro abaixo.</li>
            )}
            {items.map((item) => (
              <li
                key={item.id}
                className="flex items-center gap-2 rounded-[14px] border border-border bg-bg-card px-3 py-2"
              >
                <span className="flex-1 text-sm font-semibold">{item.childName}</span>
                <label className="flex min-h-11 items-center gap-2 text-xs font-normal text-text-muted">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-border-strong accent-[var(--brand)]"
                    checked={item.removable}
                    disabled={busy === item.id}
                    onChange={(event) => void changeRemovable(item, event.target.checked)}
                  />
                  Cliente pode tirar
                </label>
                <label className="text-xs font-normal text-text-muted">
                  Qtd
                  <input
                    aria-label={`Quantidade de ${item.childName}`}
                    className={cn(FIELD_CLASS, 'mt-1 w-16 text-center')}
                    inputMode="numeric"
                    value={String(item.quantity)}
                    disabled={busy === item.id}
                    onChange={(event) => {
                      const next = Number(event.target.value);
                      if (Number.isInteger(next) && next >= 1) void changeQuantity(item, next);
                    }}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remover ${item.childName} do combo`}
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border text-text-muted transition-colors hover:border-critical-strong hover:text-critical-strong focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40"
                  disabled={busy === item.id}
                  onClick={() => void removeItem(item)}
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <div className="mt-3 flex flex-wrap items-end gap-2">
            <label className="grid flex-1 gap-1 text-xs font-normal text-text-muted">
              Produto
              <select
                aria-label="Produto para adicionar ao combo"
                className={FIELD_CLASS}
                value={childId}
                onChange={(event) => setChildId(event.target.value)}
              >
                <option value="">Escolher produto…</option>
                {selectable.map((product) => (
                  <option key={product.id} value={product.id}>
                    {product.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-1 text-xs font-normal text-text-muted">
              Qtd
              <input
                aria-label="Quantidade do novo item"
                className={cn(FIELD_CLASS, 'w-16 text-center')}
                inputMode="numeric"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
              />
            </label>
            <MoButton
              type="button"
              className="shrink-0"
              disabled={!childId || busy === 'add'}
              onClick={() => void addItem()}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar
            </MoButton>
          </div>
          {selectable.length === 0 && (
            <p className="mt-2 text-sm text-text-muted">
              Todos os produtos disponíveis já estão no combo, ou o cardápio ainda não tem outros
              produtos.
            </p>
          )}
        </>
      )}
    </div>
  );
}
