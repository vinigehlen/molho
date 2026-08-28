'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Search } from 'lucide-react';
import { centsToBRL } from '../../../lib/format';
import { getStaffSession } from '../../../lib/staff-session';
import {
  createModifier,
  fetchAllModifierGroups,
  fetchModifiers,
  setModifierGroupActive,
  updateModifierGroup,
  type Modifier,
  type ModifierGroupWithProduct,
} from '../../../lib/catalog-api';

function brlToCents(value: string): number {
  const normalized = value.replace(/[^\d,]/g, '').replace(',', '.');
  return Math.max(0, Math.round(Number(normalized || '0') * 100));
}

/**
 * Aba própria (exceção MVP 2026-08-28, mesmo pedido do PM que tirou combo
 * do "fora do MVP" — CLAUDE.md): TODOS os grupos de complemento do tenant
 * num lugar só, com busca e pausa em massa — no cadastro-por-produto
 * (/gestor/cardapio) o lojista só via o grupo de UM item por vez.
 *
 * Grupo ainda é 1:1 com produto (reuso entre produtos é a fase 2 já
 * combinada) — o nome do produto dono aparece em cada linha só pra
 * contexto, não dá pra "linkar" o mesmo grupo em outro produto ainda.
 */
export default function ComplementosPage() {
  const [groups, setGroups] = useState<ModifierGroupWithProduct[]>([]);
  const [modifiers, setModifiers] = useState<Record<string, Modifier[]>>({});
  const [expandedId, setExpandedId] = useState('');
  const [editDraft, setEditDraft] = useState({ name: '', min: '0', max: '1', pdvCode: '' });
  const [modifierDraft, setModifierDraft] = useState<Record<string, { name: string; price: string }>>({});
  const [busca, setBusca] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const gruposFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return groups;
    return groups.filter((group) => group.name.toLowerCase().includes(termo) || group.productName.toLowerCase().includes(termo));
  }, [groups, busca]);

  useEffect(() => {
    if (!getStaffSession()) return;
    setBusy('load');
    setError(null);
    fetchAllModifierGroups()
      .then(setGroups)
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar complementos.'))
      .finally(() => setBusy(null));
  }, []);

  function openGroup(group: ModifierGroupWithProduct) {
    if (expandedId === group.id) {
      setExpandedId('');
      return;
    }
    setExpandedId(group.id);
    setEditDraft({ name: group.name, min: String(group.min), max: String(group.max), pdvCode: group.pdvCode ?? '' });
    if (!modifiers[group.id]) {
      fetchModifiers(group.id)
        .then((loaded) => setModifiers((prev) => ({ ...prev, [group.id]: loaded })))
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os itens do grupo.'));
    }
  }

  async function toggleActive(group: ModifierGroupWithProduct) {
    setBusy(`active:${group.id}`);
    try {
      const updated = await setModifierGroupActive(group, !group.active);
      setGroups((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o grupo.');
    } finally {
      setBusy(null);
    }
  }

  async function saveGroup(group: ModifierGroupWithProduct) {
    if (!editDraft.name.trim()) return;
    setBusy('save-group');
    try {
      const updated = await updateModifierGroup(group, {
        name: editDraft.name.trim(),
        min: Number(editDraft.min || 0),
        max: Number(editDraft.max || 1),
        pdvCode: editDraft.pdvCode.trim() || null,
      });
      setGroups((prev) => prev.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
      setMessage('Grupo atualizado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o grupo.');
    } finally {
      setBusy(null);
    }
  }

  async function addModifier(groupId: string) {
    const draft = modifierDraft[groupId];
    if (!draft?.name.trim()) return;
    setBusy(`modifier:${groupId}`);
    try {
      const created = await createModifier({ groupId, name: draft.name.trim(), priceDeltaCents: brlToCents(draft.price) });
      setModifiers((prev) => ({ ...prev, [groupId]: [...(prev[groupId] ?? []), created] }));
      setModifierDraft((prev) => ({ ...prev, [groupId]: { name: '', price: '' } }));
      setMessage('Item adicionado ao grupo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar o item.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-bg p-4 text-text md:p-8">
      <div className="mx-auto max-w-4xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold">Complementos</h1>
          <p className="mt-1 text-sm text-text-muted">Todos os grupos de tamanho, sabor e adicional do cardápio, num lugar só.</p>
        </header>

        {(error || message) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`rounded-[14px] border p-4 text-sm ${error ? 'border-critical bg-bg-card text-critical' : 'border-positive bg-bg-card text-positive'}`}
          >
            {error ?? message}
          </div>
        )}

        <section className="rounded-[20px] border border-border bg-bg-card p-5">
          <div className="flex items-center gap-2 rounded-[14px] border border-border bg-bg px-3">
            <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
            <input
              className="h-11 flex-1 bg-transparent outline-none"
              value={busca}
              onChange={(event) => setBusca(event.target.value)}
              placeholder="Buscar grupo ou produto"
              aria-label="Buscar grupo ou produto"
            />
          </div>

          <div className="mt-4 grid gap-2">
            {groups.length === 0 && busy !== 'load' && (
              <div className="rounded-[14px] border border-dashed border-border bg-bg p-5">
                <p className="font-semibold">Nenhum grupo de complemento ainda.</p>
                <p className="mt-1 text-sm text-text-muted">Crie o primeiro editando um item no Cardápio.</p>
              </div>
            )}
            {groups.length > 0 && gruposFiltrados.length === 0 && (
              <p className="text-sm text-text-muted">Nenhum grupo bate com &ldquo;{busca}&rdquo;.</p>
            )}
            {gruposFiltrados.map((group) => {
              const expanded = expandedId === group.id;
              return (
                <div key={group.id} className={`rounded-[14px] border ${expanded ? 'border-brand bg-brand-faint' : 'border-border bg-bg'}`}>
                  <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                    <button className="flex-1 text-left" onClick={() => openGroup(group)}>
                      <span className="font-semibold">{group.name}</span>
                      <span className="ml-2 text-sm text-text-muted">{group.productName} · mín. {group.min}, máx. {group.max}</span>
                      {group.pdvCode && <span className="ml-2 text-xs text-text-muted">PDV: {group.pdvCode}</span>}
                    </button>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={busy === `active:${group.id}`}
                        onClick={() => void toggleActive(group)}
                        className={`rounded-full px-2 py-0.5 text-xs font-semibold disabled:opacity-50 ${group.active ? 'bg-positive/10 text-positive' : 'bg-bg-card text-text-muted'}`}
                      >
                        {group.active ? 'ativo' : 'pausado'}
                      </button>
                      <button className="rounded-[14px] border border-border px-3 py-2 text-sm font-semibold" onClick={() => openGroup(group)}>
                        {expanded ? 'Fechar' : 'Editar'}
                      </button>
                    </div>
                  </div>
                  {expanded && (
                    <div className="border-t border-border p-4">
                      <div className="grid gap-3 md:grid-cols-4">
                        <input className="h-11 rounded-[14px] border border-border bg-bg-card px-3 md:col-span-2" value={editDraft.name} onChange={(event) => setEditDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nome do grupo" />
                        <input className="h-11 rounded-[14px] border border-border bg-bg-card px-3" value={editDraft.min} onChange={(event) => setEditDraft((prev) => ({ ...prev, min: event.target.value }))} placeholder="Mín." />
                        <input className="h-11 rounded-[14px] border border-border bg-bg-card px-3" value={editDraft.max} onChange={(event) => setEditDraft((prev) => ({ ...prev, max: event.target.value }))} placeholder="Máx." />
                        <input className="h-11 rounded-[14px] border border-border bg-bg-card px-3 md:col-span-3" value={editDraft.pdvCode} onChange={(event) => setEditDraft((prev) => ({ ...prev, pdvCode: event.target.value }))} placeholder="Código no PDV (opcional)" />
                        <button className="rounded-[14px] bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50" disabled={busy === 'save-group'} onClick={() => void saveGroup(group)}>
                          {busy === 'save-group' ? 'Salvando…' : 'Salvar grupo'}
                        </button>
                      </div>

                      <div className="mt-4">
                        <p className="text-sm font-semibold">Itens do grupo</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {(modifiers[group.id] ?? []).map((item) => (
                            <span key={item.id} className="rounded-full border border-border px-3 py-1 text-sm">
                              {item.name} {item.priceDeltaCents > 0 ? `+${centsToBRL(item.priceDeltaCents)}` : 'sem custo'}
                            </span>
                          ))}
                          {(modifiers[group.id] ?? []).length === 0 && <span className="text-sm text-text-muted">Nenhum item ainda.</span>}
                        </div>
                        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_160px_120px]">
                          <input
                            className="h-11 rounded-[14px] border border-border bg-bg-card px-3"
                            value={modifierDraft[group.id]?.name ?? ''}
                            onChange={(event) => setModifierDraft((prev) => ({ ...prev, [group.id]: { ...(prev[group.id] ?? { price: '' }), name: event.target.value } }))}
                            placeholder="Extra queijo / Sem salada / Calabresa"
                          />
                          <div className="flex h-11 items-center rounded-[14px] border border-border bg-bg-card px-3 focus-within:border-brand">
                            <span className="mr-2 text-sm font-semibold text-text-muted">R$</span>
                            <input
                              className="h-full min-w-0 flex-1 bg-transparent outline-none"
                              inputMode="decimal"
                              value={modifierDraft[group.id]?.price ?? ''}
                              onChange={(event) => setModifierDraft((prev) => ({ ...prev, [group.id]: { ...(prev[group.id] ?? { name: '' }), price: event.target.value } }))}
                              placeholder="4,00"
                            />
                          </div>
                          <button className="rounded-[14px] border border-border font-semibold" onClick={() => void addModifier(group.id)}>Adicionar</button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
