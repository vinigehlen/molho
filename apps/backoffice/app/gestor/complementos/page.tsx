'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Copy, Layers3, Link2, Plus, Search, Trash2, Unlink } from 'lucide-react';
import { getStaffSession } from '../../../lib/staff-session';
import {
  copyModifierGroupForProduct,
  createModifier,
  createModifierGroup,
  deleteModifier,
  deleteModifierGroup,
  fetchAllModifierGroups,
  fetchCategories,
  fetchModifiers,
  fetchProducts,
  linkModifierGroupToProduct,
  reorderModifiers,
  setModifierGroupActive,
  unlinkModifierGroupFromProduct,
  updateModifier,
  updateModifierGroup,
  uploadModifierImage,
  type Modifier,
  type ModifierGroupWithProduct,
  type Product,
} from '../../../lib/catalog-api';
import { ModifierOptionEditor, type ModifierPatch } from './modifier-option-editor';

type GroupFilter = 'all' | 'active' | 'paused' | 'reused' | 'required' | 'optional';

interface NewOptionDraft {
  name: string;
  description: string;
  price: string;
  pdvCode: string;
}

const EMPTY_OPTION: NewOptionDraft = { name: '', description: '', price: '', pdvCode: '' };

const FILTERS: Array<{ id: GroupFilter; label: string }> = [
  { id: 'all', label: 'Todos' },
  { id: 'active', label: 'Ativos' },
  { id: 'paused', label: 'Pausados' },
  { id: 'reused', label: 'Reutilizados' },
  { id: 'required', label: 'Obrigatórios' },
  { id: 'optional', label: 'Opcionais' },
];

function brlToCents(value: string): number {
  const normalized = value.replace(/[^\d,]/g, '').replace(',', '.');
  return Math.max(0, Math.round(Number(normalized || '0') * 100));
}

function groupMatchesFilter(group: ModifierGroupWithProduct, filter: GroupFilter): boolean {
  if (filter === 'active') return group.active;
  if (filter === 'paused') return !group.active;
  if (filter === 'reused') return group.productIds.length > 1;
  if (filter === 'required') return group.min > 0;
  if (filter === 'optional') return group.min === 0;
  return true;
}

function isValidSelectionRange(minValue: string, maxValue: string): boolean {
  const min = Number(minValue);
  const max = Number(maxValue);
  return Number.isInteger(min) && Number.isInteger(max) && min >= 0 && max >= min;
}

export default function ComplementosPage() {
  const [groups, setGroups] = useState<ModifierGroupWithProduct[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [modifiers, setModifiers] = useState<Record<string, Modifier[]>>({});
  const [expandedId, setExpandedId] = useState('');
  const [editAllowed, setEditAllowed] = useState<Record<string, boolean>>({});
  const [editDraft, setEditDraft] = useState({ name: '', min: '0', max: '1', pdvCode: '' });
  const [newOption, setNewOption] = useState<Record<string, NewOptionDraft>>({});
  const [linkDraft, setLinkDraft] = useState<Record<string, string>>({});
  const [copyDraft, setCopyDraft] = useState<Record<string, string>>({});
  const [createOpen, setCreateOpen] = useState(false);
  const [createDraft, setCreateDraft] = useState({ productId: '', name: '', min: '0', max: '1', pdvCode: '' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [confirmGroupDelete, setConfirmGroupDelete] = useState('');
  const [confirmUnlink, setConfirmUnlink] = useState<{ groupId: string; productId: string } | null>(null);
  const [busca, setBusca] = useState('');
  const [filter, setFilter] = useState<GroupFilter>('all');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const productById = useMemo(() => new Map(products.map((product) => [product.id, product])), [products]);

  const filteredGroups = useMemo(() => {
    const term = busca.trim().toLocaleLowerCase('pt-BR');
    return groups.filter((group) => {
      const matchesSearch =
        !term ||
        group.name.toLocaleLowerCase('pt-BR').includes(term) ||
        group.productNames.some((name) => name.toLocaleLowerCase('pt-BR').includes(term)) ||
        group.pdvCode?.toLocaleLowerCase('pt-BR').includes(term);
      return matchesSearch && groupMatchesFilter(group, filter);
    });
  }, [busca, filter, groups]);

  const selectedGroups = groups.filter((group) => selectedIds.has(group.id));
  const createRangeValid = isValidSelectionRange(createDraft.min, createDraft.max);
  const editRangeValid = isValidSelectionRange(editDraft.min, editDraft.max);

  async function reloadGroups(): Promise<ModifierGroupWithProduct[]> {
    const loaded = await fetchAllModifierGroups();
    setGroups(loaded);
    setSelectedIds((current) => new Set([...current].filter((id) => loaded.some((group) => group.id === id))));
    return loaded;
  }

  useEffect(() => {
    if (!getStaffSession()) return;
    setBusy('load');
    setError(null);
    Promise.all([
      fetchAllModifierGroups(),
      fetchCategories().then(async (categories) => (await Promise.all(categories.map(({ id }) => fetchProducts(id)))).flat()),
    ])
      .then(([loadedGroups, loadedProducts]) => {
        setGroups(loadedGroups);
        setProducts(loadedProducts);
        setCreateDraft((current) => ({ ...current, productId: current.productId || loadedProducts[0]?.id || '' }));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os complementos.'))
      .finally(() => setBusy(null));
  }, []);

  function beginAction(key: string) {
    setBusy(key);
    setError(null);
    setMessage(null);
  }

  function openGroup(group: ModifierGroupWithProduct) {
    if (expandedId === group.id) {
      setExpandedId('');
      return;
    }
    setExpandedId(group.id);
    setEditAllowed((current) => ({ ...current, [group.id]: group.productIds.length === 1 }));
    setEditDraft({ name: group.name, min: String(group.min), max: String(group.max), pdvCode: group.pdvCode ?? '' });
    setLinkDraft((current) => ({
      ...current,
      [group.id]: products.find((product) => !group.productIds.includes(product.id))?.id ?? '',
    }));
    setCopyDraft((current) => ({ ...current, [group.id]: group.productIds[0] ?? '' }));
    if (!modifiers[group.id]) {
      fetchModifiers(group.id)
        .then((loaded) => setModifiers((current) => ({ ...current, [group.id]: loaded })))
        .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar as opções.'));
    }
  }

  async function createGroup() {
    if (!createDraft.productId || !createDraft.name.trim()) return;
    beginAction('create-group');
    try {
      const created = await createModifierGroup({
        productId: createDraft.productId,
        name: createDraft.name.trim(),
        min: Number(createDraft.min || 0),
        max: Number(createDraft.max || 1),
        pdvCode: createDraft.pdvCode.trim() || null,
      });
      await reloadGroups();
      setCreateDraft((current) => ({ ...current, name: '', min: '0', max: '1', pdvCode: '' }));
      setCreateOpen(false);
      setExpandedId(created.id);
      setEditAllowed((current) => ({ ...current, [created.id]: true }));
      setModifiers((current) => ({ ...current, [created.id]: [] }));
      setEditDraft({ name: created.name, min: String(created.min), max: String(created.max), pdvCode: created.pdvCode ?? '' });
      setMessage('Grupo criado. Agora coloque as opções no capricho.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o grupo.');
    } finally {
      setBusy(null);
    }
  }

  async function toggleGroup(group: ModifierGroupWithProduct) {
    beginAction(`group:${group.id}`);
    try {
      const updated = await setModifierGroupActive(group, !group.active);
      setGroups((current) => current.map((item) => (item.id === group.id ? { ...item, ...updated } : item)));
      setMessage(updated.active ? 'Grupo reativado.' : 'Grupo pausado para o cliente.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o grupo.');
    } finally {
      setBusy(null);
    }
  }

  async function saveGroup(group: ModifierGroupWithProduct) {
    if (!editDraft.name.trim()) return;
    beginAction(`group:${group.id}`);
    try {
      const updated = await updateModifierGroup(group, {
        name: editDraft.name.trim(),
        min: Number(editDraft.min || 0),
        max: Number(editDraft.max || 1),
        pdvCode: editDraft.pdvCode.trim() || null,
      });
      setGroups((current) => current.map((item) => (item.id === group.id ? { ...item, ...updated } : item)));
      setMessage('Grupo atualizado em todos os produtos vinculados.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o grupo.');
    } finally {
      setBusy(null);
    }
  }

  async function addOption(groupId: string) {
    const draft = newOption[groupId] ?? EMPTY_OPTION;
    if (!draft.name.trim()) return;
    beginAction(`new-option:${groupId}`);
    try {
      const created = await createModifier({
        groupId,
        name: draft.name.trim(),
        description: draft.description.trim() || null,
        priceDeltaCents: brlToCents(draft.price),
        pdvCode: draft.pdvCode.trim() || null,
      });
      setModifiers((current) => ({ ...current, [groupId]: [...(current[groupId] ?? []), created] }));
      setNewOption((current) => ({ ...current, [groupId]: EMPTY_OPTION }));
      setMessage('Opção adicionada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível adicionar a opção.');
    } finally {
      setBusy(null);
    }
  }

  async function updateOption(groupId: string, item: Modifier, input: ModifierPatch) {
    beginAction(`option:${item.id}`);
    try {
      const updated = await updateModifier(item, input);
      setModifiers((current) => ({
        ...current,
        [groupId]: (current[groupId] ?? []).map((option) => (option.id === item.id ? updated : option)),
      }));
      setMessage('Opção atualizada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a opção.');
    } finally {
      setBusy(null);
    }
  }

  async function removeOption(groupId: string, item: Modifier) {
    beginAction(`option:${item.id}`);
    try {
      await deleteModifier(item);
      setModifiers((current) => ({
        ...current,
        [groupId]: (current[groupId] ?? []).filter((option) => option.id !== item.id),
      }));
      setMessage('Opção removida.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a opção.');
    } finally {
      setBusy(null);
    }
  }

  async function uploadOptionPhoto(group: ModifierGroupWithProduct, item: Modifier, file: File) {
    beginAction(`option:${item.id}`);
    try {
      const updated = await uploadModifierImage(item, group.productId, file);
      setModifiers((current) => ({
        ...current,
        [group.id]: (current[group.id] ?? []).map((option) => (option.id === item.id ? updated : option)),
      }));
      setMessage('Foto atualizada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a foto.');
    } finally {
      setBusy(null);
    }
  }

  async function moveOption(groupId: string, index: number, direction: -1 | 1) {
    const current = modifiers[groupId] ?? [];
    const target = index + direction;
    if (!current[index] || !current[target]) return;
    const reordered = [...current];
    [reordered[index], reordered[target]] = [reordered[target]!, reordered[index]!];
    beginAction(`reorder:${groupId}`);
    try {
      const updated = await reorderModifiers(groupId, reordered);
      setModifiers((all) => ({ ...all, [groupId]: updated }));
      setMessage('Ordem atualizada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível mudar a ordem.');
      const fresh = await fetchModifiers(groupId).catch(() => current);
      setModifiers((all) => ({ ...all, [groupId]: fresh }));
    } finally {
      setBusy(null);
    }
  }

  async function linkProduct(group: ModifierGroupWithProduct) {
    const productId = linkDraft[group.id];
    if (!productId) return;
    beginAction(`link:${group.id}`);
    try {
      await linkModifierGroupToProduct(group.id, productId);
      const loaded = await reloadGroups();
      const updated = loaded.find((item) => item.id === group.id);
      if (updated) {
        setLinkDraft((current) => ({
          ...current,
          [group.id]: products.find((product) => !updated.productIds.includes(product.id))?.id ?? '',
        }));
        setEditAllowed((current) => ({ ...current, [group.id]: false }));
      }
      setMessage('Grupo reutilizado em mais um produto.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível vincular o produto.');
    } finally {
      setBusy(null);
    }
  }

  async function unlinkProduct(group: ModifierGroupWithProduct, productId: string) {
    if (group.productIds.length <= 1) return;
    beginAction(`link:${group.id}`);
    try {
      await unlinkModifierGroupFromProduct(group.id, productId);
      const loaded = await reloadGroups();
      const updated = loaded.find((item) => item.id === group.id);
      if (updated?.productIds.length === 1) {
        setEditAllowed((current) => ({ ...current, [group.id]: true }));
      }
      setConfirmUnlink(null);
      setMessage('Produto desvinculado deste grupo.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível desvincular o produto.');
    } finally {
      setBusy(null);
    }
  }

  async function copyForProduct(group: ModifierGroupWithProduct) {
    const productId = copyDraft[group.id];
    if (!productId) return;
    beginAction(`copy:${group.id}`);
    try {
      const copy = await copyModifierGroupForProduct(group.id, productId);
      const loadedGroups = await reloadGroups();
      const copiedGroup = loadedGroups.find((item) => item.id === copy.id) ?? copy;
      setExpandedId(copy.id);
      setEditAllowed((current) => ({ ...current, [copy.id]: true }));
      setEditDraft({
        name: copiedGroup.name,
        min: String(copiedGroup.min),
        max: String(copiedGroup.max),
        pdvCode: copiedGroup.pdvCode ?? '',
      });
      const loadedOptions = await fetchModifiers(copy.id);
      setModifiers((current) => ({ ...current, [copy.id]: loadedOptions }));
      setMessage(`Cópia criada só para ${productById.get(productId)?.name ?? 'o produto escolhido'}.`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar a cópia.');
    } finally {
      setBusy(null);
    }
  }

  async function removeGroup(group: ModifierGroupWithProduct) {
    beginAction(`delete:${group.id}`);
    try {
      await deleteModifierGroup(group);
      await reloadGroups();
      setExpandedId('');
      setConfirmGroupDelete('');
      setMessage('Grupo removido do cardápio.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover o grupo.');
    } finally {
      setBusy(null);
    }
  }

  async function bulkActive(active: boolean) {
    if (selectedGroups.length === 0) return;
    beginAction('bulk');
    try {
      await Promise.all(selectedGroups.filter((group) => group.active !== active).map((group) => setModifierGroupActive(group, active)));
      await reloadGroups();
      setSelectedIds(new Set());
      setMessage(active ? 'Grupos selecionados reativados.' : 'Grupos selecionados pausados.');
    } catch (cause) {
      await reloadGroups().catch(() => []);
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar todos os grupos.');
    } finally {
      setBusy(null);
    }
  }

  async function bulkDelete() {
    if (selectedGroups.length === 0) return;
    beginAction('bulk');
    try {
      await Promise.all(selectedGroups.map((group) => deleteModifierGroup(group)));
      await reloadGroups();
      setSelectedIds(new Set());
      setConfirmBulkDelete(false);
      setMessage('Grupos selecionados removidos.');
    } catch (cause) {
      await reloadGroups().catch(() => []);
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover todos os grupos.');
    } finally {
      setBusy(null);
    }
  }

  function toggleSelected(groupId: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
    setConfirmBulkDelete(false);
  }

  return (
    <main className="complementos-page min-h-screen bg-bg p-4 text-text md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="text-sm font-semibold text-brand">Cardápio</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight">Biblioteca de complementos</h1>
            <p className="mt-2 max-w-2xl text-sm text-text-muted">Crie uma vez, reutilize em vários pratos e mantenha preço, foto e disponibilidade das opções num só lugar.</p>
          </div>
          <button type="button" onClick={() => setCreateOpen((open) => !open)} className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-brand px-5 text-sm font-semibold text-on-brand hover:bg-brand-strong"><Plus className="h-4 w-4" aria-hidden="true" /> Novo grupo</button>
        </header>

        {(error || message) && <div role={error ? 'alert' : 'status'} className={`rounded-[14px] border bg-bg-card p-4 text-sm ${error ? 'border-critical text-critical-strong' : 'border-positive text-positive'}`}>{error ?? message}</div>}

        {createOpen && (
          <section className="rounded-[20px] border border-brand bg-brand-faint p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-brand text-on-brand"><Layers3 className="h-5 w-5" aria-hidden="true" /></span>
              <div className="flex-1">
                <h2 className="text-lg font-semibold">Novo grupo de escolhas</h2>
                <p className="text-sm text-text-muted">Escolha um produto de origem. Depois você pode reutilizar o grupo nos demais.</p>
                <div className="mt-4 grid gap-3 md:grid-cols-6">
                  <label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-2">Produto<select aria-label="Produto do novo grupo" className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text" value={createDraft.productId} onChange={(event) => setCreateDraft((current) => ({ ...current, productId: event.target.value }))}>{products.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select></label>
                  <label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-2">Nome do grupo<input className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text outline-none focus:border-brand" value={createDraft.name} maxLength={80} onChange={(event) => setCreateDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Ex.: Escolha o tamanho" /></label>
                  <label className="grid gap-1 text-xs font-semibold text-text-muted">Mínimo<input className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text" inputMode="numeric" value={createDraft.min} onChange={(event) => setCreateDraft((current) => ({ ...current, min: event.target.value }))} /></label>
                  <label className="grid gap-1 text-xs font-semibold text-text-muted">Máximo<input className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text" inputMode="numeric" value={createDraft.max} onChange={(event) => setCreateDraft((current) => ({ ...current, max: event.target.value }))} /></label>
                  <label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-4">Código do grupo no PDV<input className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text" value={createDraft.pdvCode} maxLength={60} onChange={(event) => setCreateDraft((current) => ({ ...current, pdvCode: event.target.value }))} placeholder="Opcional" /></label>
                  {!createRangeValid && <p role="alert" className="text-xs font-semibold text-critical-strong md:col-span-6">O mínimo precisa ser zero ou maior e não pode passar do máximo.</p>}
                  <div className="flex items-end gap-2 md:col-span-2"><button type="button" onClick={() => setCreateOpen(false)} className="h-11 flex-1 rounded-[14px] border border-border bg-bg-card px-4 text-sm font-semibold">Cancelar</button><button type="button" disabled={busy === 'create-group' || !createDraft.productId || !createDraft.name.trim() || !createRangeValid} onClick={() => void createGroup()} className="h-11 flex-1 rounded-[14px] bg-brand px-4 text-sm font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted">{busy === 'create-group' ? 'Criando…' : 'Criar grupo'}</button></div>
                </div>
              </div>
            </div>
          </section>
        )}

        <section className="rounded-[20px] border border-border bg-bg-card p-4 md:p-5">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="flex items-center gap-2 rounded-[14px] border border-border-strong bg-bg px-3 focus-within:border-brand focus-within:shadow-focus"><Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" /><input className="h-11 flex-1 border-0 bg-transparent text-sm outline-none focus-visible:shadow-none" value={busca} onChange={(event) => setBusca(event.target.value)} placeholder="Buscar grupo, produto ou código do PDV" aria-label="Buscar grupo ou produto" /></div>
            <p className="text-sm font-semibold tabular-nums text-text-muted">{filteredGroups.length} de {groups.length} grupos</p>
          </div>
          <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Filtrar grupos">
            {FILTERS.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-11 shrink-0 rounded-full border px-3 py-2 text-sm font-semibold ${filter === item.id ? 'border-brand bg-brand-faint text-brand-strong' : 'border-border bg-bg text-text-muted hover:border-brand'}`}>{item.label}</button>)}
          </div>

          {selectedGroups.length > 0 && (
            <div className="mt-4 rounded-[14px] border border-brand bg-brand-faint p-3">
              <div className="flex flex-wrap items-center gap-2"><p className="mr-auto text-sm font-semibold tabular-nums">{selectedGroups.length} selecionado{selectedGroups.length > 1 ? 's' : ''}</p><button type="button" disabled={busy === 'bulk'} onClick={() => void bulkActive(true)} className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:text-text-muted">Reativar</button><button type="button" disabled={busy === 'bulk'} onClick={() => void bulkActive(false)} className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:text-text-muted">Pausar</button><button type="button" disabled={busy === 'bulk'} onClick={() => setConfirmBulkDelete(true)} className="inline-flex h-11 items-center gap-2 rounded-[14px] px-3 text-sm font-semibold text-critical-strong disabled:cursor-not-allowed disabled:text-text-muted"><Trash2 className="h-4 w-4" aria-hidden="true" /> Remover</button></div>
              {confirmBulkDelete && <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-brand/20 pt-3 text-sm"><AlertTriangle className="h-4 w-4 text-critical-strong" aria-hidden="true" /><span className="font-semibold">Isso remove os grupos de todos os produtos vinculados.</span><button type="button" disabled={busy === 'bulk'} onClick={() => void bulkDelete()} className="h-11 rounded-[14px] bg-critical-strong px-3 font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted">Sim, remover</button><button type="button" onClick={() => setConfirmBulkDelete(false)} className="h-11 rounded-[14px] px-3 font-semibold">Cancelar</button></div>}
            </div>
          )}

          <div className="mt-4 grid gap-3">
            {busy === 'load' && (
              <div role="status" aria-label="Carregando grupos" className="grid gap-3">
                <span className="sr-only">Carregando complementos…</span>
                {[0, 1, 2].map((item) => (
                  <div key={item} className="animate-pulse rounded-[20px] border border-border bg-bg p-4">
                    <div className="h-4 w-2/5 rounded-full bg-border" />
                    <div className="mt-3 h-3 w-3/5 rounded-full bg-border" />
                    <div className="mt-4 h-11 w-full rounded-[14px] bg-border/70" />
                  </div>
                ))}
              </div>
            )}
            {groups.length === 0 && busy !== 'load' && <div className="rounded-[14px] border border-dashed border-border bg-bg p-8 text-center"><Layers3 className="mx-auto h-8 w-8 text-brand" aria-hidden="true" /><p className="mt-3 font-semibold">Seu primeiro grupo começa aqui.</p><p className="mt-1 text-sm text-text-muted">Crie tamanhos, sabores e adicionais sem precisar abrir cada produto.</p><button type="button" onClick={() => setCreateOpen(true)} className="mt-4 h-11 rounded-[14px] bg-brand px-5 text-sm font-semibold text-on-brand">Criar primeiro grupo</button></div>}
            {groups.length > 0 && filteredGroups.length === 0 && <div className="rounded-[14px] border border-dashed border-border bg-bg p-6 text-center text-sm text-text-muted">Nenhum grupo encontrado com estes filtros.</div>}

            {filteredGroups.map((group) => {
              const expanded = expandedId === group.id;
              const shared = group.productIds.length > 1;
              const optionList = modifiers[group.id] ?? [];
              const unlinkedProducts = products.filter((product) => !group.productIds.includes(product.id));
              return (
                <article key={group.id} className={`overflow-hidden rounded-[20px] border bg-bg ${expanded ? 'border-brand' : 'border-border'}`}>
                  <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center">
                    <label className="grid h-11 w-11 shrink-0 cursor-pointer place-items-center rounded-[14px] border border-border bg-bg-card" title="Selecionar grupo"><input type="checkbox" aria-label={`Selecionar ${group.name}`} checked={selectedIds.has(group.id)} onChange={() => toggleSelected(group.id)} className="h-4 w-4 accent-brand" /></label>
                    <button type="button" className="min-w-0 flex-1 text-left" onClick={() => openGroup(group)}><span className="flex flex-wrap items-center gap-2"><span className="text-base font-semibold">{group.name}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${group.active ? 'bg-positive/10 text-positive' : 'bg-bg-card text-text-muted'}`}>{group.active ? 'Ativo' : 'Pausado'}</span>{shared && <span className="rounded-full bg-brand-faint px-2 py-0.5 text-xs font-semibold text-brand-strong">Reutilizado em {group.productIds.length}</span>}</span><span className="mt-1 block truncate text-sm text-text-muted">{group.productNames.join(' · ')}</span></button>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-text-muted"><span className="rounded-full border border-border bg-bg-card px-2.5 py-1">{group.min > 0 ? 'Obrigatório' : 'Opcional'}</span><span className="rounded-full border border-border bg-bg-card px-2.5 py-1">{group.max === 1 ? 'Escolha única' : `Até ${group.max} escolhas`}</span>{group.pdvCode && <span className="rounded-full border border-border bg-bg-card px-2.5 py-1">PDV {group.pdvCode}</span>}</div>
                    <div className="flex items-center gap-2"><button type="button" disabled={busy === `group:${group.id}`} onClick={() => void toggleGroup(group)} className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-semibold hover:border-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted">{group.active ? 'Pausar' : 'Reativar'}</button><button type="button" onClick={() => openGroup(group)} className="h-11 rounded-[14px] bg-text px-4 text-sm font-semibold text-bg-card">{expanded ? 'Fechar' : 'Gerenciar'}</button></div>
                  </div>

                  {expanded && (
                    <div className="border-t border-border bg-bg-card p-4 md:p-5">
                      <section>
                        <div className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-semibold">Onde este grupo aparece</h2><p className="mt-1 text-sm text-text-muted">Reutilizar mantém as mesmas opções e preços em todos os produtos.</p></div><Link2 className="h-5 w-5 text-brand" aria-hidden="true" /></div>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {group.productIds.map((productId, index) => {
                            const productName = group.productNames[index] ?? productById.get(productId)?.name ?? 'Produto';
                            return (
                              <span key={productId} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border bg-bg pl-3 text-sm font-semibold">
                                {productName}
                                {group.productIds.length > 1 && (
                                  <button
                                    type="button"
                                    title="Desvincular produto"
                                    aria-label={`Desvincular ${productName}`}
                                    disabled={busy === `link:${group.id}`}
                                    onClick={() => setConfirmUnlink({ groupId: group.id, productId })}
                                    className="grid h-11 w-11 place-items-center rounded-full text-text-muted hover:text-critical-strong disabled:cursor-not-allowed disabled:text-border"
                                  >
                                    <Unlink className="h-4 w-4" aria-hidden="true" />
                                  </button>
                                )}
                              </span>
                            );
                          })}
                        </div>
                        {confirmUnlink?.groupId === group.id && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 rounded-[14px] border border-critical bg-bg p-3 text-sm">
                            <AlertTriangle className="h-4 w-4 text-critical-strong" aria-hidden="true" />
                            <span className="mr-auto font-semibold">
                              Desvincular {group.productNames[group.productIds.indexOf(confirmUnlink.productId)] ?? productById.get(confirmUnlink.productId)?.name ?? 'este produto'}? O grupo continua nos demais produtos.
                            </span>
                            <button type="button" disabled={busy === `link:${group.id}`} onClick={() => void unlinkProduct(group, confirmUnlink.productId)} className="h-11 rounded-[14px] bg-critical-strong px-3 font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted">Sim, desvincular</button>
                            <button type="button" onClick={() => setConfirmUnlink(null)} className="h-11 rounded-[14px] px-3 font-semibold">Cancelar</button>
                          </div>
                        )}
                        {unlinkedProducts.length > 0 && <div className="mt-3 flex flex-col gap-2 md:flex-row"><select aria-label={`Produto para reutilizar ${group.name}`} value={linkDraft[group.id] ?? unlinkedProducts[0]?.id ?? ''} onChange={(event) => setLinkDraft((current) => ({ ...current, [group.id]: event.target.value }))} className="h-11 flex-1 rounded-[14px] border border-border bg-bg px-3 text-sm">{unlinkedProducts.map((product) => <option key={product.id} value={product.id}>{product.name}</option>)}</select><button type="button" disabled={busy === `link:${group.id}`} onClick={() => void linkProduct(group)} className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-brand px-4 text-sm font-semibold text-brand-strong disabled:cursor-not-allowed disabled:border-border disabled:text-text-muted"><Link2 className="h-4 w-4" aria-hidden="true" /> Reutilizar neste produto</button></div>}
                      </section>

                      {shared && !editAllowed[group.id] && <section className="mt-5 rounded-[14px] border border-caution bg-caution/10 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-caution" aria-hidden="true" /><div className="flex-1"><h2 className="font-semibold">Esta edição pode mudar {group.productIds.length} produtos</h2><p className="mt-1 text-sm text-text-muted">Edite o grupo compartilhado ou crie uma cópia independente para apenas um produto.</p><div className="mt-3 grid gap-2 md:grid-cols-[1fr_auto_auto]"><select aria-label={`Produto que receberá cópia de ${group.name}`} value={copyDraft[group.id] ?? group.productIds[0] ?? ''} onChange={(event) => setCopyDraft((current) => ({ ...current, [group.id]: event.target.value }))} className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm">{group.productIds.map((productId, index) => <option key={productId} value={productId}>{group.productNames[index] ?? productById.get(productId)?.name ?? 'Produto'}</option>)}</select><button type="button" disabled={busy === `copy:${group.id}`} onClick={() => void copyForProduct(group)} className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] border border-border bg-bg-card px-4 text-sm font-semibold disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted"><Copy className="h-4 w-4" aria-hidden="true" /> Criar cópia</button><button type="button" onClick={() => setEditAllowed((current) => ({ ...current, [group.id]: true }))} className="h-11 rounded-[14px] bg-caution px-4 text-sm font-semibold text-text">Editar em todos</button></div></div></div></section>}

                      {editAllowed[group.id] && (
                        <>
                          <section className="mt-5 border-t border-border pt-5"><h2 className="font-semibold">Regras do grupo</h2><div className="mt-3 grid gap-3 md:grid-cols-6"><label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-3">Nome<input aria-label="Nome do grupo" className="h-11 rounded-[14px] border border-border bg-bg px-3 text-sm font-normal text-text outline-none focus:border-brand" value={editDraft.name} maxLength={80} onChange={(event) => setEditDraft((current) => ({ ...current, name: event.target.value }))} /></label><label className="grid gap-1 text-xs font-semibold text-text-muted">Mínimo<input aria-label="Mínimo de opções do grupo" className="h-11 rounded-[14px] border border-border bg-bg px-3 text-sm font-normal text-text" inputMode="numeric" value={editDraft.min} onChange={(event) => setEditDraft((current) => ({ ...current, min: event.target.value }))} /></label><label className="grid gap-1 text-xs font-semibold text-text-muted">Máximo<input aria-label="Máximo de opções do grupo" className="h-11 rounded-[14px] border border-border bg-bg px-3 text-sm font-normal text-text" inputMode="numeric" value={editDraft.max} onChange={(event) => setEditDraft((current) => ({ ...current, max: event.target.value }))} /></label><label className="grid gap-1 text-xs font-semibold text-text-muted">Código PDV<input aria-label="Código no PDV do grupo" className="h-11 rounded-[14px] border border-border bg-bg px-3 text-sm font-normal text-text" value={editDraft.pdvCode} maxLength={60} onChange={(event) => setEditDraft((current) => ({ ...current, pdvCode: event.target.value }))} /></label>{!editRangeValid && <p role="alert" className="text-xs font-semibold text-critical-strong md:col-span-5">O mínimo precisa ser zero ou maior e não pode passar do máximo.</p>}<button type="button" disabled={busy === `group:${group.id}` || !editDraft.name.trim() || !editRangeValid} onClick={() => void saveGroup(group)} className="h-11 rounded-[14px] bg-brand px-4 text-sm font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted md:col-start-6">{busy === `group:${group.id}` ? 'Salvando…' : 'Salvar regras'}</button></div></section>

                          <section className="mt-6 border-t border-border pt-5">
                            <div className="flex flex-wrap items-end justify-between gap-2"><div><h2 className="font-semibold">Opções do grupo</h2><p className="mt-1 text-sm text-text-muted">Foto, descrição, preço, estoque manual, PDV e ordem de exibição.</p></div><span className="text-sm font-semibold tabular-nums text-text-muted">{optionList.length} opç{optionList.length === 1 ? 'ão' : 'ões'}</span></div>
                            <div className="mt-3 grid gap-3">{optionList.map((item, index) => <ModifierOptionEditor key={item.id} item={item} index={index} total={optionList.length} busy={busy === `option:${item.id}` || busy === `reorder:${group.id}`} onUpdate={(option, input) => updateOption(group.id, option, input)} onDelete={(option) => removeOption(group.id, option)} onUpload={(option, file) => uploadOptionPhoto(group, option, file)} onMove={(position, direction) => moveOption(group.id, position, direction)} />)}{optionList.length === 0 && <div className="rounded-[14px] border border-dashed border-border bg-bg p-5 text-sm text-text-muted">Nenhuma opção ainda. Adicione a primeira logo abaixo.</div>}</div>

                            <div className="mt-4 rounded-[14px] border border-dashed border-border bg-bg p-4"><p className="font-semibold">Adicionar opção</p><div className="mt-3 grid gap-3 md:grid-cols-6"><label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-2">Nome<input aria-label="Nome da nova opção" className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text" value={(newOption[group.id] ?? EMPTY_OPTION).name} maxLength={80} onChange={(event) => setNewOption((current) => ({ ...current, [group.id]: { ...(current[group.id] ?? EMPTY_OPTION), name: event.target.value } }))} placeholder="Ex.: Bacon crocante" /></label><label className="grid gap-1 text-xs font-semibold text-text-muted md:col-span-2">Descrição<input aria-label="Descrição da nova opção" className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text" value={(newOption[group.id] ?? EMPTY_OPTION).description} maxLength={240} onChange={(event) => setNewOption((current) => ({ ...current, [group.id]: { ...(current[group.id] ?? EMPTY_OPTION), description: event.target.value } }))} placeholder="Opcional" /></label><label className="grid gap-1 text-xs font-semibold text-text-muted">Preço adicional<span className="flex h-11 items-center rounded-[14px] border border-border-strong bg-bg-card px-3 focus-within:border-brand focus-within:shadow-focus"><span className="mr-2 text-sm">R$</span><input aria-label="Preço da nova opção" className="min-w-0 flex-1 border-0 bg-transparent text-sm font-normal text-text outline-none focus-visible:shadow-none" inputMode="decimal" value={(newOption[group.id] ?? EMPTY_OPTION).price} onChange={(event) => setNewOption((current) => ({ ...current, [group.id]: { ...(current[group.id] ?? EMPTY_OPTION), price: event.target.value } }))} placeholder="0,00" /></span></label><label className="grid gap-1 text-xs font-semibold text-text-muted">Código PDV<input aria-label="Código PDV da nova opção" className="h-11 rounded-[14px] border border-border bg-bg-card px-3 text-sm font-normal text-text" value={(newOption[group.id] ?? EMPTY_OPTION).pdvCode} maxLength={60} onChange={(event) => setNewOption((current) => ({ ...current, [group.id]: { ...(current[group.id] ?? EMPTY_OPTION), pdvCode: event.target.value } }))} placeholder="Opcional" /></label><button type="button" disabled={busy === `new-option:${group.id}` || !(newOption[group.id] ?? EMPTY_OPTION).name.trim()} onClick={() => void addOption(group.id)} className="inline-flex h-11 items-center justify-center gap-2 rounded-[14px] bg-text px-4 text-sm font-semibold text-bg-card disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted md:col-start-6"><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar</button></div></div>
                          </section>

                          <section className="mt-6 border-t border-border pt-5">{confirmGroupDelete === group.id ? <div className="rounded-[14px] border border-critical bg-bg p-4"><p className="font-semibold text-critical-strong">Remover “{group.name}” de {group.productIds.length} produto{group.productIds.length > 1 ? 's' : ''}?</p><p className="mt-1 text-sm text-text-muted">Os pedidos antigos continuam intactos, mas o grupo sai do cardápio.</p><div className="mt-3 flex gap-2"><button type="button" disabled={busy === `delete:${group.id}`} onClick={() => void removeGroup(group)} className="h-11 rounded-[14px] bg-critical-strong px-4 text-sm font-semibold text-on-brand disabled:cursor-not-allowed disabled:bg-border disabled:text-text-muted">Sim, remover grupo</button><button type="button" onClick={() => setConfirmGroupDelete('')} className="h-11 rounded-[14px] px-4 text-sm font-semibold">Cancelar</button></div></div> : <button type="button" onClick={() => setConfirmGroupDelete(group.id)} className="inline-flex min-h-11 items-center gap-2 rounded-[14px] px-2 text-sm font-semibold text-critical-strong"><Trash2 className="h-4 w-4" aria-hidden="true" /> Remover grupo</button>}</section>
                        </>
                      )}
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        </section>
      </div>
    </main>
  );
}
