'use client';

import Link from 'next/link';
import React, { useEffect, useMemo, useState } from 'react';
import type {
  CreateDeliveryZoneInput,
  DayOfWeek,
  DeliveryZoneResponse,
  Shift,
  UpdateDeliveryZoneInput,
} from '@molho/contracts';
import { centsToBRL } from '../../../lib/format';
import { fetchMyStores, type StaffStore } from '../../../lib/my-stores-api';
import {
  createDeliveryZone,
  deleteDeliveryZone,
  DeliveryZoneDuplicateError,
  DeliveryZoneStaleVersionError,
  fetchDeliveryZones,
  updateDeliveryZone,
} from '../../../lib/delivery-zones-api';
import { fetchStoreHours, saveStoreHours } from '../../../lib/store-hours-api';

const WEEKDAYS: readonly DayOfWeek[] = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

const WEEKDAY_LABEL: Record<DayOfWeek, string> = {
  sunday: 'Domingo',
  monday: 'Segunda',
  tuesday: 'Terça',
  wednesday: 'Quarta',
  thursday: 'Quinta',
  friday: 'Sexta',
  saturday: 'Sábado',
};

const EMPTY_ZONE_FORM = {
  id: null as string | null,
  version: null as number | null,
  name: '',
  city: '',
  state: 'RS',
  feeReais: '',
  etaMinMinutes: '30',
  etaMaxMinutes: '50',
  priority: '0',
};

type ZoneForm = typeof EMPTY_ZONE_FORM;
type EditableShift = Shift & { uiId: string };

function toEditableShifts(shifts: Shift[]): EditableShift[] {
  return shifts.map((shift) => ({ ...shift, uiId: crypto.randomUUID() }));
}

function centsFromReais(value: string): number {
  const normalized = value.replace(/\./g, '').replace(',', '.').trim();
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return -1;
  return Math.round(parsed * 100);
}

function reaisFromCents(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

function minutesToInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function inputToMinutes(value: string): number {
  const parts = value.split(':').map(Number);
  const hours = parts[0];
  const minutes = parts[1];
  if (typeof hours !== 'number' || typeof minutes !== 'number') return -1;
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return -1;
  return hours * 60 + minutes;
}

function zoneToForm(zone: DeliveryZoneResponse): ZoneForm {
  return {
    id: zone.id,
    version: zone.version,
    name: zone.name,
    city: zone.city ?? '',
    state: zone.state ?? 'RS',
    feeReais: reaisFromCents(zone.feeCents),
    etaMinMinutes: String(zone.etaMinMinutes),
    etaMaxMinutes: String(zone.etaMaxMinutes),
    priority: String(zone.priority),
  };
}

function formToZoneInput(form: ZoneForm): CreateDeliveryZoneInput | UpdateDeliveryZoneInput {
  return {
    kind: 'city',
    name: form.name.trim(),
    city: form.city.trim(),
    state: form.state.trim().toUpperCase(),
    feeCents: centsFromReais(form.feeReais),
    etaMinMinutes: Number(form.etaMinMinutes),
    etaMaxMinutes: Number(form.etaMaxMinutes),
    priority: Number(form.priority),
  };
}

export default function EntregaPage() {
  const [stores, setStores] = useState<StaffStore[]>([]);
  const [storesLoading, setStoresLoading] = useState(true);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [loadedStoreId, setLoadedStoreId] = useState('');
  const [zones, setZones] = useState<DeliveryZoneResponse[]>([]);
  const [shifts, setShifts] = useState<EditableShift[]>([]);
  const [zoneForm, setZoneForm] = useState<ZoneForm>(EMPTY_ZONE_FORM);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savingZone, setSavingZone] = useState(false);
  const [savingHours, setSavingHours] = useState(false);
  const [zonePendingDelete, setZonePendingDelete] = useState<DeliveryZoneResponse | null>(null);
  const [deletingZoneId, setDeletingZoneId] = useState<string | null>(null);
  const [zonesAvailable, setZonesAvailable] = useState(true);

  // storeReady também trava durante `loading`: troca de loja dispara load()
  // na hora, e sem isso os painéis ficariam editáveis com a MASSA DE DADOS
  // da loja anterior enquanto a da nova ainda está a caminho.
  const storeReady = loadedStoreId !== '' && !loading;
  const selectorDisabled = loading || savingZone || savingHours || deletingZoneId !== null;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchMyStores();
        if (cancelled) return;
        setStores(list);
        // 1 loja só: pré-seleciona e carrega direto, sem exigir clique —
        // é exatamente o caso mais comum (piloto é 1 loja por tenant).
        if (list.length === 1 && list[0]) {
          setSelectedStoreId(list[0].id);
          void load(list[0].id);
        } else if (list.length === 0) {
          setError('Nenhuma loja disponível para esta conta.');
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Não deu pra carregar suas lojas.');
      } finally {
        if (!cancelled) setStoresLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function load(id: string) {
    setSelectedStoreId(id);
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const [zonesResult, hoursResult] = await Promise.allSettled([fetchDeliveryZones(id), fetchStoreHours(id)]);
      if (hoursResult.status === 'rejected') throw hoursResult.reason;
      if (zonesResult.status === 'fulfilled') {
        setZones(zonesResult.value);
        setZonesAvailable(true);
      } else {
        setZones([]);
        setZonesAvailable(false);
      }
      setShifts(toEditableShifts(hoursResult.value.shifts));
      setLoadedStoreId(id);
      setZonePendingDelete(null);
      setZoneForm(EMPTY_ZONE_FORM);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu pra carregar entrega.');
    } finally {
      setLoading(false);
    }
  }

  async function submitZone() {
    if (!loadedStoreId) {
      setError('Carregue uma loja antes de salvar zonas.');
      return;
    }
    setSavingZone(true);
    setError(null);
    setMessage(null);
    try {
      const input = formToZoneInput(zoneForm);
      if (input.feeCents < 0) throw new Error('Taxa precisa ser um valor em reais válido.');
      if (input.etaMinMinutes > input.etaMaxMinutes) throw new Error('ETA mínimo precisa ser menor ou igual ao máximo.');
      const saved =
        zoneForm.id && zoneForm.version !== null
          ? await updateDeliveryZone(zoneForm.id, zoneForm.version, input)
          : await createDeliveryZone(loadedStoreId, input);
      setZones((current) => {
        const without = current.filter((zone) => zone.id !== saved.id);
        return [...without, saved].sort((a, b) => a.priority - b.priority || a.name.localeCompare(b.name));
      });
      setZoneForm(EMPTY_ZONE_FORM);
      setMessage(zoneForm.id ? 'Zona atualizada.' : 'Zona criada.');
    } catch (e) {
      if (e instanceof DeliveryZoneStaleVersionError) {
        setZoneForm(EMPTY_ZONE_FORM);
        await load(loadedStoreId);
        setError(e.message);
      } else if (e instanceof DeliveryZoneDuplicateError) setError(e.message);
      else setError(e instanceof Error ? e.message : 'Não deu pra salvar zona.');
    } finally {
      setSavingZone(false);
    }
  }

  async function removeZone(zone: DeliveryZoneResponse) {
    if (zone.kind === 'polygon') return;
    setDeletingZoneId(zone.id);
    setError(null);
    setMessage(null);
    try {
      await deleteDeliveryZone(zone.id, zone.version);
      setZones((current) => current.filter((item) => item.id !== zone.id));
      if (zoneForm.id === zone.id) setZoneForm(EMPTY_ZONE_FORM);
      setZonePendingDelete(null);
      setMessage('Zona excluída.');
    } catch (e) {
      if (e instanceof DeliveryZoneStaleVersionError) {
        setZonePendingDelete(null);
        await load(loadedStoreId);
        setError(e.message);
      } else {
        setError(e instanceof Error ? e.message : 'Não deu pra excluir zona.');
      }
    } finally {
      setDeletingZoneId(null);
    }
  }

  async function submitHours() {
    if (!loadedStoreId) {
      setError('Carregue uma loja antes de salvar horários.');
      return;
    }
    setSavingHours(true);
    setError(null);
    setMessage(null);
    try {
      const saved = await saveStoreHours(loadedStoreId, { shifts: shifts.map(({ uiId: _uiId, ...shift }) => shift) });
      setShifts(toEditableShifts(saved.shifts));
      setMessage('Horários salvos.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não deu pra salvar horários.');
    } finally {
      setSavingHours(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg p-4">
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <PageHeader />
        <StoreSelector
          stores={stores}
          storesLoading={storesLoading}
          selectedStoreId={selectedStoreId}
          loadedStoreId={loadedStoreId}
          loading={loading}
          disabled={selectorDisabled}
          onSelect={(id) => void load(id)}
        />

        {(error || message) && (
          <div
            className={`rounded-[14px] border p-3 text-sm ${
              error ? 'border-critical bg-bg-card text-critical' : 'border-positive bg-bg-card text-positive'
            }`}
            role="status"
          >
            {error ?? message}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <ZonesPanel
            zones={zones}
            zonesAvailable={zonesAvailable}
            form={zoneForm}
            setForm={setZoneForm}
            saving={savingZone}
            disabled={!storeReady || savingZone || deletingZoneId !== null}
            pendingDelete={zonePendingDelete}
            deletingZoneId={deletingZoneId}
            onSubmit={() => void submitZone()}
            onRequestRemove={setZonePendingDelete}
            onCancelRemove={() => setZonePendingDelete(null)}
            onConfirmRemove={(zone) => void removeZone(zone)}
          />
          <HoursPanel
            shifts={shifts}
            setShifts={setShifts}
            saving={savingHours}
            disabled={!storeReady || savingHours}
            onSubmit={() => void submitHours()}
          />
        </div>
      </div>
    </main>
  );
}

function PageHeader() {
  return (
    <div className="flex items-center justify-between gap-3">
      <div>
        <p className="text-sm font-medium text-brand-strong">Entrega</p>
        <h1 className="text-2xl font-semibold text-text">Zonas e horários</h1>
        <p className="mt-1 text-sm text-text-muted">
          Configure cidades atendidas, taxa, prazo e a grade semanal da loja.
        </p>
      </div>
      <Link className="rounded-full border border-border px-3 py-1 text-sm font-medium text-text" href="/gestor">
        Voltar aos pedidos
      </Link>
    </div>
  );
}

function StoreSelector({
  stores,
  storesLoading,
  selectedStoreId,
  loadedStoreId,
  loading,
  disabled,
  onSelect,
}: {
  stores: StaffStore[];
  storesLoading: boolean;
  selectedStoreId: string;
  loadedStoreId: string;
  loading: boolean;
  disabled: boolean;
  onSelect: (storeId: string) => void;
}) {
  const activeStore = stores.find((store) => store.id === loadedStoreId);

  return (
    <section className="rounded-[20px] border border-border bg-bg-card p-4">
      <h2 className="text-base font-semibold text-text">Loja</h2>

      {storesLoading ? (
        <p className="mt-3 text-sm text-text-muted">Carregando suas lojas…</p>
      ) : stores.length === 0 ? (
        <p className="mt-3 text-sm text-text-muted">Nenhuma loja disponível para esta conta.</p>
      ) : stores.length === 1 ? (
        // Loja única: sem dropdown, nada a escolher — só mostra qual está ativa.
        <p className="mt-1 text-sm text-text-muted">{stores[0]?.name}</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-text-muted">Escolha a loja pra ver zonas e horários dela.</p>
          <select
            className="mt-3 w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm text-text disabled:opacity-50"
            aria-label="Loja"
            value={selectedStoreId}
            onChange={(e) => onSelect(e.target.value)}
            disabled={disabled}
          >
            {stores.map((store) => (
              <option key={store.id} value={store.id}>
                {store.name}
              </option>
            ))}
          </select>
        </>
      )}

      {loading ? (
        <p className="mt-3 text-sm text-text-muted">Carregando zonas e horários…</p>
      ) : activeStore ? (
        <div className="mt-3 rounded-[14px] border border-border bg-bg p-3" aria-label="Loja ativa">
          <p className="text-xs font-medium text-text-muted">Loja ativa</p>
          <p className="mt-1 text-sm text-text">{activeStore.name}</p>
        </div>
      ) : (
        stores.length > 0 && <p className="mt-3 text-sm text-text-muted">Nenhuma loja carregada.</p>
      )}
    </section>
  );
}

function ZonesPanel({
  zones,
  zonesAvailable,
  form,
  setForm,
  saving,
  disabled,
  pendingDelete,
  deletingZoneId,
  onSubmit,
  onRequestRemove,
  onCancelRemove,
  onConfirmRemove,
}: {
  zones: DeliveryZoneResponse[];
  zonesAvailable: boolean;
  form: ZoneForm;
  setForm: (form: ZoneForm) => void;
  saving: boolean;
  disabled: boolean;
  pendingDelete: DeliveryZoneResponse | null;
  deletingZoneId: string | null;
  onSubmit: () => void;
  onRequestRemove: (zone: DeliveryZoneResponse) => void;
  onCancelRemove: () => void;
  onConfirmRemove: (zone: DeliveryZoneResponse) => void;
}) {
  const cityZones = zones.filter((zone) => zone.kind === 'city');
  const polygonZones = zones.filter((zone) => zone.kind === 'polygon');

  if (!zonesAvailable) {
    return (
      <section className="rounded-[20px] border border-border bg-bg-card p-4">
        <h2 className="text-base font-semibold text-text">Zonas por cidade</h2>
        <p className="mt-3 text-sm text-text-muted" role="status">
          Módulo de zonas de entrega não está ativo para esta loja. Os horários seguem funcionando normalmente.
        </p>
      </section>
    );
  }

  return (
    <section className="rounded-[20px] border border-border bg-bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold text-text">Zonas por cidade</h2>
          <p className="mt-1 text-sm text-text-muted">Uma cidade por loja. Duplicata volta como aviso claro, sem erro cru.</p>
        </div>
        {form.id && (
          <button
            className="rounded-full border border-border px-3 py-1 text-xs text-text disabled:opacity-50"
            onClick={() => setForm(EMPTY_ZONE_FORM)}
            disabled={disabled}
          >
            Nova zona
          </button>
        )}
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <Field label="Nome">
          <input
            className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm text-text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            placeholder="Estância Velha"
            disabled={disabled}
          />
        </Field>
        <Field label="Cidade">
          <input
            className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm text-text"
            value={form.city}
            onChange={(e) => setForm({ ...form, city: e.target.value })}
            placeholder="Estância Velha"
            disabled={disabled}
          />
        </Field>
        <Field label="UF">
          <input
            className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm uppercase text-text"
            value={form.state}
            onChange={(e) => setForm({ ...form, state: e.target.value.toUpperCase().slice(0, 2) })}
            placeholder="RS"
            disabled={disabled}
          />
        </Field>
        <Field label="Taxa">
          <input
            className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm tabular-nums text-text"
            value={form.feeReais}
            onChange={(e) => setForm({ ...form, feeReais: e.target.value })}
            placeholder="8,00"
            inputMode="decimal"
            disabled={disabled}
          />
        </Field>
        <Field label="ETA mínimo">
          <input
            className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm tabular-nums text-text"
            value={form.etaMinMinutes}
            onChange={(e) => setForm({ ...form, etaMinMinutes: e.target.value })}
            inputMode="numeric"
            disabled={disabled}
          />
        </Field>
        <Field label="ETA máximo">
          <input
            className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm tabular-nums text-text"
            value={form.etaMaxMinutes}
            onChange={(e) => setForm({ ...form, etaMaxMinutes: e.target.value })}
            inputMode="numeric"
            disabled={disabled}
          />
        </Field>
        <Field label="Prioridade">
          <input
            className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-sm tabular-nums text-text"
            value={form.priority}
            onChange={(e) => setForm({ ...form, priority: e.target.value })}
            inputMode="numeric"
            disabled={disabled}
          />
        </Field>
      </div>

      <button
        className="mt-4 w-full rounded-[14px] bg-brand px-4 py-2 text-sm font-medium text-on-brand disabled:opacity-50"
        onClick={onSubmit}
        disabled={disabled || saving}
      >
        {saving ? 'Salvando…' : form.id ? 'Salvar zona' : 'Criar zona'}
      </button>

      <div className="mt-5 space-y-3">
        {cityZones.map((zone) => (
          <div key={zone.id} className="rounded-[14px] border border-border bg-bg p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-text">{zone.name}</h3>
                <p className="mt-1 text-sm text-text-muted">
                  {zone.city}/{zone.state} · {centsToBRL(zone.feeCents)} · {zone.etaMinMinutes}–{zone.etaMaxMinutes} min · prioridade{' '}
                  {zone.priority}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  className="rounded-[10px] border border-border px-2 py-1 text-xs text-text"
                  onClick={() => setForm(zoneToForm(zone))}
                  disabled={disabled}
                >
                  Editar
                </button>
                <button
                  className="rounded-[10px] border border-critical px-2 py-1 text-xs text-critical"
                  onClick={() => onRequestRemove(zone)}
                  disabled={disabled}
                >
                  Excluir
                </button>
              </div>
            </div>
          </div>
        ))}

        {pendingDelete?.kind === 'city' && (
          <div className="rounded-[14px] border border-critical bg-bg p-3" role="alertdialog" aria-modal="true">
            <h3 className="font-medium text-text">Excluir {pendingDelete.name}?</h3>
            <p className="mt-1 text-sm text-text-muted">
              A zona de {pendingDelete.city}/{pendingDelete.state} deixará de atender novos pedidos.
            </p>
            <div className="mt-3 flex justify-end gap-2">
              <button
                className="rounded-[10px] border border-border px-3 py-2 text-sm text-text disabled:opacity-50"
                onClick={onCancelRemove}
                disabled={deletingZoneId !== null}
              >
                Cancelar
              </button>
              <button
                className="rounded-[10px] border border-critical px-3 py-2 text-sm font-medium text-critical disabled:opacity-50"
                onClick={() => onConfirmRemove(pendingDelete)}
                disabled={deletingZoneId !== null}
              >
                {deletingZoneId === pendingDelete.id ? 'Excluindo…' : `Excluir ${pendingDelete.name}`}
              </button>
            </div>
          </div>
        )}

        {polygonZones.map((zone) => (
          <div key={zone.id} className="rounded-[14px] border border-border bg-bg p-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="font-medium text-text">{zone.name}</h3>
                <p className="mt-1 text-sm text-text-muted">
                  {centsToBRL(zone.feeCents)} · {zone.etaMinMinutes}–{zone.etaMaxMinutes} min · prioridade {zone.priority}
                </p>
              </div>
              <span className="rounded-full bg-brand-faint px-3 py-1 text-xs font-medium text-brand-strong">
                zona por raio — editar via suporte
              </span>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

function HoursPanel({
  shifts,
  setShifts,
  saving,
  disabled,
  onSubmit,
}: {
  shifts: EditableShift[];
  setShifts: (shifts: EditableShift[]) => void;
  saving: boolean;
  disabled: boolean;
  onSubmit: () => void;
}) {
  const shiftsByDay = useMemo(() => {
    const grouped = new Map<DayOfWeek, EditableShift[]>();
    for (const day of WEEKDAYS) grouped.set(day, []);
    for (const shift of shifts) grouped.get(shift.dayOfWeek)?.push(shift);
    for (const day of WEEKDAYS) {
      grouped.get(day)?.sort((a, b) => a.opensAtMinutes - b.opensAtMinutes);
    }
    return grouped;
  }, [shifts]);

  function addShift(dayOfWeek: DayOfWeek) {
    setShifts([...shifts, { uiId: crypto.randomUUID(), dayOfWeek, opensAtMinutes: 18 * 60, closesAtMinutes: 23 * 60 }]);
  }

  function updateShift(target: EditableShift, patch: Partial<Shift>) {
    setShifts(
      shifts.map((shift) => (shift.uiId === target.uiId ? { ...shift, ...patch } : shift)),
    );
  }

  function removeShift(target: EditableShift) {
    setShifts(shifts.filter((shift) => shift.uiId !== target.uiId));
  }

  return (
    <section className="rounded-[20px] border border-border bg-bg-card p-4">
      <h2 className="text-base font-semibold text-text">Horários</h2>
      <p className="mt-1 text-sm text-text-muted">
        Salva a semana inteira. Dia sem turno fica fechado; fechar menor que abrir significa atravessar meia-noite.
      </p>

      <div className="mt-4 space-y-3">
        {WEEKDAYS.map((day) => {
          const dayShifts = shiftsByDay.get(day) ?? [];
          return (
            <div key={day} className="rounded-[14px] border border-border bg-bg p-3">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-medium text-text">{WEEKDAY_LABEL[day]}</h3>
                <button
                  className="rounded-[10px] border border-border px-2 py-1 text-xs text-text disabled:opacity-50"
                  onClick={() => addShift(day)}
                  disabled={disabled}
                >
                  Adicionar turno
                </button>
              </div>

              {dayShifts.length === 0 ? (
                <p className="mt-2 text-sm text-text-muted">Fechado</p>
              ) : (
                <div className="mt-3 space-y-2">
                  {dayShifts.map((shift) => (
                    <div key={shift.uiId} className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                      <Field label="Abre">
                        <input
                          className="w-full rounded-[14px] border border-border bg-bg-card px-3 py-2 text-sm tabular-nums text-text"
                          type="time"
                          value={minutesToInput(shift.opensAtMinutes)}
                          onChange={(e) => updateShift(shift, { opensAtMinutes: inputToMinutes(e.target.value) })}
                          disabled={disabled}
                        />
                      </Field>
                      <Field label="Fecha">
                        <input
                          className="w-full rounded-[14px] border border-border bg-bg-card px-3 py-2 text-sm tabular-nums text-text"
                          type="time"
                          value={minutesToInput(shift.closesAtMinutes)}
                          onChange={(e) => updateShift(shift, { closesAtMinutes: inputToMinutes(e.target.value) })}
                          disabled={disabled}
                        />
                      </Field>
                      <button
                        className="rounded-[10px] border border-critical px-2 py-2 text-xs text-critical disabled:opacity-50"
                        onClick={() => removeShift(shift)}
                        disabled={disabled}
                      >
                        Remover
                      </button>
                      {shift.closesAtMinutes < shift.opensAtMinutes && (
                        <p className="col-span-3 text-xs text-brand-strong">Atravessa meia-noite.</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        className="mt-4 w-full rounded-[14px] bg-brand px-4 py-2 text-sm font-medium text-on-brand disabled:opacity-50"
        onClick={onSubmit}
        disabled={disabled || saving}
      >
        {saving ? 'Salvando…' : 'Salvar horários'}
      </button>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-text-muted">{label}</span>
      {children}
    </label>
  );
}
