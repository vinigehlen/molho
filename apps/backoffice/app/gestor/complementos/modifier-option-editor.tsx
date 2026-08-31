'use client';

import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Save, Trash2, X } from 'lucide-react';
import type { Modifier } from '../../../lib/catalog-api';

export type ModifierPatch = Partial<
  Pick<Modifier, 'name' | 'description' | 'imageKey' | 'priceDeltaCents' | 'active' | 'pdvCode'>
>;

interface ModifierOptionEditorProps {
  item: Modifier;
  index: number;
  total: number;
  busy: boolean;
  onUpdate: (item: Modifier, input: ModifierPatch) => Promise<void>;
  onDelete: (item: Modifier) => Promise<void>;
  onUpload: (item: Modifier, file: File) => Promise<void>;
  onMove: (index: number, direction: -1 | 1) => Promise<void>;
}

function centsToInput(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function inputToCents(value: string): number {
  const normalized = value.replace(/[^\d,]/g, '').replace(',', '.');
  return Math.max(0, Math.round(Number(normalized || '0') * 100));
}

export function ModifierOptionEditor({
  item,
  index,
  total,
  busy,
  onUpdate,
  onDelete,
  onUpload,
  onMove,
}: ModifierOptionEditorProps) {
  const [draft, setDraft] = useState({
    name: item.name,
    description: item.description ?? '',
    price: centsToInput(item.priceDeltaCents),
    pdvCode: item.pdvCode ?? '',
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    setDraft({
      name: item.name,
      description: item.description ?? '',
      price: centsToInput(item.priceDeltaCents),
      pdvCode: item.pdvCode ?? '',
    });
  }, [item.description, item.name, item.pdvCode, item.priceDeltaCents]);

  return (
    <article className="rounded-[14px] border border-border bg-bg-card p-4 [&_button]:focus-visible:outline-none [&_button]:focus-visible:shadow-focus [&_input]:border-border-strong [&_input]:focus-visible:outline-none [&_input]:focus-visible:shadow-focus">
      <div className="flex flex-col items-start gap-3 md:flex-row">
        <div
          role="img"
          aria-label={item.imageUrl ? `Foto de ${item.name}` : `Sem foto para ${item.name}`}
          className="h-16 w-16 shrink-0 rounded-[14px] border border-border bg-bg bg-cover bg-center"
          style={item.imageUrl ? { backgroundImage: `url(${item.imageUrl})` } : undefined}
        >
          {!item.imageUrl && <ImagePlus className="m-5 h-6 w-6 text-text-muted" aria-hidden="true" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="font-semibold">{item.name}</p>
              <p className="text-xs text-text-muted">Opção {index + 1} de {total}</p>
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void onUpdate(item, { active: !(item.active ?? true) })}
              className={`min-h-11 rounded-full px-3 py-2 text-sm font-semibold ${item.active === false ? 'bg-bg text-text-muted' : 'bg-positive/10 text-positive'} disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted`}
            >
              {item.active === false ? 'Pausado' : 'Disponível'}
            </button>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Nome
              <input
                className="h-11 rounded-[14px] border border-border bg-bg px-3 text-sm font-normal text-text outline-none focus:border-brand"
                value={draft.name}
                maxLength={80}
                onChange={(event) => setDraft((previous) => ({ ...previous, name: event.target.value }))}
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-text-muted">
              Preço adicional
              <span className="flex h-11 items-center rounded-[14px] border border-border-strong bg-bg px-3 focus-within:border-brand focus-within:shadow-focus">
                <span className="mr-2 text-sm">R$</span>
                <input
                  aria-label={`Preço de ${item.name}`}
                  className="h-full min-w-0 flex-1 bg-transparent text-sm font-normal text-text outline-none"
                  inputMode="decimal"
                  value={draft.price}
                  onChange={(event) => setDraft((previous) => ({ ...previous, price: event.target.value }))}
                />
              </span>
            </label>
            <label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-2">
              Descrição para o cliente
              <input
                className="h-11 rounded-[14px] border border-border bg-bg px-3 text-sm font-normal text-text outline-none focus:border-brand"
                value={draft.description}
                maxLength={240}
                onChange={(event) => setDraft((previous) => ({ ...previous, description: event.target.value }))}
                placeholder="Ex.: duas fatias bem crocantes"
              />
            </label>
            <label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-2">
              Código no PDV
              <input
                className="h-11 rounded-[14px] border border-border bg-bg px-3 text-sm font-normal text-text outline-none focus:border-brand"
                value={draft.pdvCode}
                maxLength={60}
                onChange={(event) => setDraft((previous) => ({ ...previous, pdvCode: event.target.value }))}
                placeholder="Opcional"
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            <label className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-[14px] border border-border-strong px-3 text-sm font-semibold hover:border-brand focus-within:shadow-focus">
              <ImagePlus className="h-4 w-4" aria-hidden="true" />
              {item.imageUrl ? 'Trocar foto' : 'Adicionar foto'}
              <input
                className="sr-only"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                disabled={busy}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void onUpload(item, file);
                  event.target.value = '';
                }}
              />
            </label>
            {item.imageKey && (
              <button
                type="button"
                disabled={busy}
                onClick={() => void onUpdate(item, { imageKey: null })}
                className="inline-flex h-11 items-center gap-2 rounded-[14px] px-3 text-sm font-semibold text-text-muted hover:bg-bg disabled:cursor-not-allowed disabled:text-border"
              >
                <X className="h-4 w-4" aria-hidden="true" /> Remover foto
              </button>
            )}
            <span className="ml-auto flex items-center gap-2">
              <button
                type="button"
                title="Mover para cima"
                aria-label={`Mover ${item.name} para cima`}
                disabled={busy || index === 0}
                onClick={() => void onMove(index, -1)}
                className="grid h-11 w-11 place-items-center rounded-[14px] border border-border hover:border-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
              >
                <ArrowUp className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                title="Mover para baixo"
                aria-label={`Mover ${item.name} para baixo`}
                disabled={busy || index === total - 1}
                onClick={() => void onMove(index, 1)}
                className="grid h-11 w-11 place-items-center rounded-[14px] border border-border hover:border-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
              >
                <ArrowDown className="h-4 w-4" aria-hidden="true" />
              </button>
              <button
                type="button"
                disabled={busy || !draft.name.trim()}
                onClick={() =>
                  void onUpdate(item, {
                    name: draft.name.trim(),
                    description: draft.description.trim() || null,
                    priceDeltaCents: inputToCents(draft.price),
                    pdvCode: draft.pdvCode.trim() || null,
                  })
                }
                className="inline-flex h-11 items-center gap-2 rounded-[14px] bg-brand px-4 text-sm font-semibold text-on-brand hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
              >
                <Save className="h-4 w-4" aria-hidden="true" /> {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </span>
          </div>

          <div className="mt-3 border-t border-border pt-3">
            {confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-semibold text-critical-strong">Remover esta opção?</span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onDelete(item)}
                  className="h-11 rounded-[14px] bg-critical-strong px-3 font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"
                >
                  Sim, remover
                </button>
                <button type="button" className="h-11 rounded-[14px] px-3 font-semibold" onClick={() => setConfirmDelete(false)}>
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="inline-flex min-h-11 items-center gap-2 rounded-[14px] px-2 text-sm font-semibold text-critical-strong"
                onClick={() => setConfirmDelete(true)}
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" /> Remover opção
              </button>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}
