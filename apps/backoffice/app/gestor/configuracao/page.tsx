'use client';

import React, { useEffect, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, CircleDashed, Plus, Trash2 } from 'lucide-react';
import Link from 'next/link';
import type { DayOfWeek, Shift, StoreSetup, UpdateStoreSetupInput } from '@molho/contracts';
import { MoButton, MoSheet } from '@molho/ui';
import { getStaffSession, setStaffSession } from '../../../lib/staff-session';
import { centsToBRL } from '../../../lib/format';
import { fetchMyStores, type StaffStore } from '../../../lib/my-stores-api';
import { fetchStoreSetup, saveStoreSetup } from '../../../lib/store-setup-api';
import { fetchStoreHours, saveStoreHours } from '../../../lib/store-hours-api';
import { createDeliveryZone, fetchDeliveryZones, type DeliveryZoneResponse } from '../../../lib/delivery-zones-api';
import { fetchCategories, fetchProducts, type Category, type Product } from '../../../lib/catalog-api';

const DAYS: Array<{ key: DayOfWeek; label: string }> = [
  { key: 'monday', label: 'Seg' },
  { key: 'tuesday', label: 'Ter' },
  { key: 'wednesday', label: 'Qua' },
  { key: 'thursday', label: 'Qui' },
  { key: 'friday', label: 'Sex' },
  { key: 'saturday', label: 'Sáb' },
  { key: 'sunday', label: 'Dom' },
];

/** Domingo primeiro, uma letra só — mesma ordem/formato do seletor de dias
 * do iFood ("D S T Q Q S S"), só pro círculo de atalho do modal. A lista
 * detalhada abaixo continua Seg→Dom (DAYS), que é a ordem operacional real. */
const DAY_CIRCLES: Array<{ key: DayOfWeek; letter: string; label: string }> = [
  { key: 'sunday', letter: 'D', label: 'Domingo' },
  { key: 'monday', letter: 'S', label: 'Segunda' },
  { key: 'tuesday', letter: 'T', label: 'Terça' },
  { key: 'wednesday', letter: 'Q', label: 'Quarta' },
  { key: 'thursday', letter: 'Q', label: 'Quinta' },
  { key: 'friday', letter: 'S', label: 'Sexta' },
  { key: 'saturday', letter: 'S', label: 'Sábado' },
];

/** Opções de horário do modal (a cada 30min) — troca o `<input type="time">`
 * nativo (cada navegador desenha o próprio, inconsistente) por um `<select>`
 * com a MESMA cara em qualquer lugar, batendo com o visual de dropdown do
 * iFood. */
const TIME_OPTIONS: string[] = Array.from({ length: 48 }, (_, i) => {
  const h = Math.floor(i / 2).toString().padStart(2, '0');
  const m = i % 2 === 0 ? '00' : '30';
  return `${h}:${m}`;
});

type HoursDraft = Record<DayOfWeek, Array<{ opens: string; closes: string }>>;

const EMPTY_HOURS: HoursDraft = {
  monday: [],
  tuesday: [],
  wednesday: [],
  thursday: [],
  friday: [],
  saturday: [],
  sunday: [],
};

function brlToCents(value: string): number {
  const normalized = value.replace(/[^\d,]/g, '').replace(',', '.');
  return Math.max(0, Math.round(Number(normalized || '0') * 100));
}

function minutesToTime(minutes: number): string {
  const hour = Math.floor(minutes / 60).toString().padStart(2, '0');
  const minute = (minutes % 60).toString().padStart(2, '0');
  return `${hour}:${minute}`;
}

function timeToMinutes(value: string): number {
  const [hour = '0', minute = '0'] = value.split(':');
  return Number(hour) * 60 + Number(minute);
}

function shiftsToDraft(shifts: Shift[]): HoursDraft {
  const draft = structuredClone(EMPTY_HOURS);
  for (const shift of shifts) {
    draft[shift.dayOfWeek].push({
      opens: minutesToTime(shift.opensAtMinutes),
      closes: minutesToTime(shift.closesAtMinutes),
    });
  }
  return draft;
}

function draftToShifts(draft: HoursDraft): Shift[] {
  return DAYS.flatMap(({ key }) =>
    draft[key].map((shift) => ({
      dayOfWeek: key,
      opensAtMinutes: timeToMinutes(shift.opens),
      closesAtMinutes: timeToMinutes(shift.closes),
    })),
  );
}

function emptyStoreForm(): UpdateStoreSetupInput {
  return {
    cnpj: null,
    ownerName: null,
    name: '',
    addressText: '',
    phone: null,
    whatsappNumber: null,
    minOrderCents: 0,
    pixKey: null,
    pixKeyType: null,
    pixMerchantCity: null,
  };
}

function stepLabel(step: string): string {
  const labels: Record<string, string> = {
    loja: 'Loja',
    horarios: 'Horários',
    cardapio: 'Cardápio',
    entrega: 'Entrega',
    pagamento: 'Pagamento',
    publicar: 'Publicar',
  };
  return labels[step] ?? step;
}

/** Cardápio é página própria (/gestor/cardapio); pagamento vive dentro da
 * seção #loja. Todo o resto é âncora nesta mesma página. */
function sectionHref(step: string): string {
  if (step === 'cardapio') return '/gestor/cardapio';
  if (step === 'pagamento') return '#loja';
  return `#${step}`;
}

export default function ConfiguracaoPage() {
  const [stores, setStores] = useState<StaffStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [setup, setSetup] = useState<StoreSetup | null>(null);
  const [storeForm, setStoreForm] = useState<UpdateStoreSetupInput>(emptyStoreForm);
  const [hours, setHours] = useState<HoursDraft>(EMPTY_HOURS);
  const [zones, setZones] = useState<DeliveryZoneResponse[]>([]);
  // Categorias/produtos só pra saber se o passo "Cardápio" do checklist está
  // completo — o CRUD de verdade mora em /gestor/cardapio (aba própria).
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [zoneDraft, setZoneDraft] = useState({ name: '', city: '', state: '', fee: '', etaMin: '30', etaMax: '60' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hoursMessage, setHoursMessage] = useState<string | null>(null);
  const [horariosModalAberto, setHorariosModalAberto] = useState(false);
  const [diasRecolhidos, setDiasRecolhidos] = useState<Set<DayOfWeek>>(new Set());
  const [error, setError] = useState<string | null>(null);

  const checklist = {
    loja: Boolean(setup?.name && setup.addressText && setup.phone && setup.whatsappNumber && setup.cnpj),
    horarios: draftToShifts(hours).length > 0,
    cardapio: categories.length > 0 && products.some((product) => product.available),
    entrega: zones.length > 0,
    pagamento: Boolean(setup?.pixKey && setup.pixKeyType && setup.pixMerchantCity),
  };
  const publishable = Object.values(checklist).every(Boolean);
  const completedSteps = Object.values(checklist).filter(Boolean).length;
  const totalSteps = Object.keys(checklist).length;
  const nextStep =
    Object.entries(checklist).find(([, ok]) => !ok)?.[0] ?? 'publicar';
  // Pagamento vive na seção #loja (sem #pagamento própria); Cardápio virou
  // página própria (/gestor/cardapio, não mais uma seção aqui) — os dois
  // precisam de destino diferente de `#${key}` pro CTA/chip não linkar pra
  // uma âncora que não existe mais nesta página.
  const nextStepHref = sectionHref(nextStep);
  // `tenantSlug` só existe na sessão pós-login/signup (staff-session.ts) —
  // sem ele (sessão antiga, storage não migrado) o domínio simplesmente não
  // aparece, nunca quebra a página.
  const tenantSlug = getStaffSession()?.tenantSlug;
  // Domínio real de produção é `{slug}.molho.live` (CLAUDE.md); em dev o
  // tenant é servido em rota (`molho.vercel.app/{slug}`) — o texto usa a
  // marca de produção, o link abre onde a loja REALMENTE responde hoje.
  const storefrontUrl = tenantSlug ? `https://molho.vercel.app/${tenantSlug}` : null;

  useEffect(() => {
    if (!getStaffSession()) return;
    fetchMyStores()
      .then((loaded) => {
        setStores(loaded);
        setStoreId(loaded[0]?.id ?? '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar suas lojas.'));
  }, []);

  useEffect(() => {
    if (!storeId) return;
    let cancelled = false;
    async function load() {
      setBusy('load');
      setError(null);
      try {
        const [loadedSetup, loadedHours, loadedZones, loadedCategories] = await Promise.all([
          fetchStoreSetup(storeId),
          fetchStoreHours(storeId),
          fetchDeliveryZones(storeId),
          fetchCategories(),
        ]);
        if (cancelled) return;
        setSetup(loadedSetup);
        setStoreForm({
          cnpj: loadedSetup.cnpj,
          ownerName: loadedSetup.ownerName,
          name: loadedSetup.name,
          addressText: loadedSetup.addressText,
          phone: loadedSetup.phone,
          whatsappNumber: loadedSetup.whatsappNumber,
          minOrderCents: loadedSetup.minOrderCents,
          pixKey: loadedSetup.pixKey,
          pixKeyType: loadedSetup.pixKeyType,
          pixMerchantCity: loadedSetup.pixMerchantCity,
        });
        setHours(shiftsToDraft(loadedHours.shifts));
        setZones(loadedZones);
        setCategories(loadedCategories);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a configuração.');
      } finally {
        if (!cancelled) setBusy(null);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [storeId]);

  useEffect(() => {
    if (categories.length === 0) {
      setProducts([]);
      return;
    }
    Promise.all(categories.map((category) => fetchProducts(category.id)))
      .then((lists) => setProducts(lists.flat()))
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar produtos.'));
  }, [categories]);

  async function saveStore() {
    if (!storeId) return;
    setBusy('store');
    setError(null);
    try {
      const saved = await saveStoreSetup(storeId, storeForm);
      setSetup(saved);
      // Nome fantasia sincroniza o slug no backend (store-setup.repository.ts)
      // — sem atualizar a sessão local aqui, o link do domínio no topo ficava
      // mostrando o slug ANTIGO até o staff deslogar e logar de novo.
      const session = getStaffSession();
      if (session && session.tenantSlug !== saved.tenantSlug) {
        setStaffSession({ ...session, tenantSlug: saved.tenantSlug });
      }
      setMessage('Loja salva.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar a loja.');
    } finally {
      setBusy(null);
    }
  }

  async function saveHours() {
    if (!storeId) return;
    setBusy('hours');
    setError(null);
    setHoursMessage(null);
    try {
      const saved = await saveStoreHours(storeId, { shifts: draftToShifts(hours) });
      setHours(shiftsToDraft(saved.shifts));
      setHoursMessage('Horários salvos com sucesso.');
      setMessage('Horários salvos.');
      setHorariosModalAberto(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar horários.');
    } finally {
      setBusy(null);
    }
  }

  async function addZone() {
    if (!storeId || !zoneDraft.name.trim() || !zoneDraft.city.trim() || zoneDraft.state.trim().length !== 2) return;
    setBusy('zone');
    try {
      const created = await createDeliveryZone(storeId, {
        kind: 'city',
        name: zoneDraft.name.trim(),
        city: zoneDraft.city.trim(),
        state: zoneDraft.state.trim().toUpperCase(),
        feeCents: brlToCents(zoneDraft.fee),
        etaMinMinutes: Number(zoneDraft.etaMin || 0),
        etaMaxMinutes: Number(zoneDraft.etaMax || 0),
        priority: zones.length,
      });
      setZones((prev) => [...prev, created]);
      setZoneDraft({ name: '', city: '', state: '', fee: '', etaMin: '30', etaMax: '60' });
      setMessage('Zona criada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar zona.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <main className="min-h-screen bg-bg p-4 text-text md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="rounded-[12px] border border-border bg-bg-card p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              {publishable ? (
                <CheckCircle2 className="h-6 w-6 shrink-0 text-positive" aria-hidden="true" />
              ) : (
                <CircleDashed className="h-6 w-6 shrink-0 text-caution" aria-hidden="true" />
              )}
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-text">{publishable ? 'Loja pronta' : 'Loja em preparo'}</p>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${publishable ? 'bg-positive/10 text-positive' : 'bg-caution/10 text-caution'}`}>
                    {completedSteps}/{totalSteps}
                  </span>
                </div>
                <p className="text-sm text-text-muted">
                  {publishable ? 'Já pode receber clientes.' : `Falta completar: ${stepLabel(nextStep)}.`}
                </p>
                {storefrontUrl && (
                  <a href={storefrontUrl} target="_blank" rel="noopener noreferrer" className="mt-1 inline-block text-xs font-medium text-brand-strong underline-offset-2 hover:underline">
                    molho.live/{tenantSlug}
                  </a>
                )}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {publishable ? (
                <>
                  <a href="#loja" className="rounded-[14px] border border-border px-4 py-2 text-sm font-semibold text-text">Editar loja</a>
                  <Link href="/gestor" className="rounded-[14px] bg-brand px-4 py-2 text-sm font-semibold text-on-brand">Ir para pedidos</Link>
                </>
              ) : (
                <>
                  <Link href="/gestor" className="rounded-[14px] border border-border px-4 py-2 text-sm font-semibold text-text">Ir para pedidos</Link>
                  <a href={nextStepHref} className="rounded-[14px] bg-brand px-4 py-2 text-sm font-semibold text-on-brand">Completar {stepLabel(nextStep)}</a>
                </>
              )}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            {Object.entries(checklist).map(([key, ok]) => {
              const isNext = !ok && key === nextStep;
              return (
                <a
                  key={key}
                  href={sectionHref(key)}
                  className={`flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium ${
                    ok
                      ? 'border-positive/30 bg-positive/10 text-positive'
                      : isNext
                        ? 'border-caution/40 bg-caution/10 text-caution'
                        : 'border-border text-text-muted'
                  }`}
                >
                  <span className={`h-2 w-2 rounded-full ${ok ? 'bg-positive' : isNext ? 'bg-caution' : 'bg-border-strong'}`} />
                  {stepLabel(key)}
                </a>
              );
            })}
          </div>
        </header>

        {(error || message) && (
          <div
            role={error ? 'alert' : 'status'}
            className={`rounded-[14px] border p-4 text-sm ${error ? 'border-critical bg-bg-card text-critical' : 'border-positive bg-bg-card text-positive'}`}
          >
            {error ?? message}
          </div>
        )}

        {stores.length > 1 && (
          <label className="block rounded-[20px] border border-border bg-bg-card p-5 text-sm font-medium">
            Loja
            <select className="mt-2 h-12 w-full rounded-[14px] border border-border bg-bg px-3" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
              {stores.map((store) => <option key={store.id} value={store.id}>{store.name}</option>)}
            </select>
          </label>
        )}

        <section id="loja" className="rounded-[20px] border border-border bg-bg-card p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Sua loja</h2>
              <p className="mt-1 text-sm text-text-muted">Esses dados aparecem no cardápio, no checkout e na cobrança PIX.</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-sm font-semibold ${checklist.loja && checklist.pagamento ? 'bg-positive/10 text-positive' : 'bg-brand-faint text-brand-strong'}`}>
              {checklist.loja && checklist.pagamento ? 'Dados completos' : 'Complete antes de publicar'}
            </span>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <Field label="Nome fantasia" value={storeForm.name} onChange={(value) => setStoreForm((prev) => ({ ...prev, name: value }))} />
            <Field label="CNPJ" value={storeForm.cnpj ?? ''} onChange={(value) => setStoreForm((prev) => ({ ...prev, cnpj: value || null }))} placeholder="12.345.678/0001-90" />
            <Field label="Responsável" value={storeForm.ownerName ?? ''} onChange={(value) => setStoreForm((prev) => ({ ...prev, ownerName: value || null }))} />
            <Field label="Telefone comercial" value={storeForm.phone ?? ''} onChange={(value) => setStoreForm((prev) => ({ ...prev, phone: value || null }))} />
            <Field label="WhatsApp de pedidos" value={storeForm.whatsappNumber ?? ''} onChange={(value) => setStoreForm((prev) => ({ ...prev, whatsappNumber: value || null }))} />
            <MoneyField label="Pedido mínimo" value={centsToBRL(storeForm.minOrderCents)} onChange={(value) => setStoreForm((prev) => ({ ...prev, minOrderCents: brlToCents(value) }))} />
            <label className="block md:col-span-2">
              <span className="text-sm font-medium">Endereço completo e referência</span>
              <textarea className="mt-2 min-h-24 w-full rounded-[14px] border border-border bg-bg px-4 py-3 outline-none focus:border-brand" value={storeForm.addressText} onChange={(event) => setStoreForm((prev) => ({ ...prev, addressText: event.target.value }))} />
            </label>
          </div>
          <div className="mt-5 grid gap-4 md:grid-cols-3">
            <Field label="Chave PIX" value={storeForm.pixKey ?? ''} onChange={(value) => setStoreForm((prev) => ({ ...prev, pixKey: value || null }))} />
            <label className="block">
              <span className="text-sm font-medium">Tipo da chave</span>
              <select className="mt-2 h-12 w-full rounded-[14px] border border-border bg-bg px-3" value={storeForm.pixKeyType ?? ''} onChange={(event) => setStoreForm((prev) => ({ ...prev, pixKeyType: (event.target.value || null) as UpdateStoreSetupInput['pixKeyType'] }))}>
                <option value="">Selecione</option>
                <option value="cpf">CPF</option>
                <option value="cnpj">CNPJ</option>
                <option value="email">E-mail</option>
                <option value="phone">Telefone</option>
                <option value="random">Aleatória</option>
              </select>
            </label>
            <Field label="Cidade PIX" value={storeForm.pixMerchantCity ?? ''} onChange={(value) => setStoreForm((prev) => ({ ...prev, pixMerchantCity: value || null }))} placeholder="SAO PAULO" />
          </div>
          <button className="mt-5 rounded-[14px] bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy === 'store'} onClick={() => void saveStore()}>
            Salvar loja
          </button>
        </section>

        <section id="horarios" className="rounded-[20px] border border-border bg-bg-card p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Horários</h2>
              <p className="mt-1 text-sm text-text-muted">
                {DAYS.some(({ key }) => hours[key].length > 0)
                  ? `Aberto ${DAYS.filter(({ key }) => hours[key].length > 0).map(({ label }) => label).join(', ')}.`
                  : 'Nenhum dia aberto ainda.'}
              </p>
            </div>
            <MoButton variant="secondary" onClick={() => setHorariosModalAberto(true)}>
              Editar horários
            </MoButton>
          </div>
          {hoursMessage && <p role="status" className="mt-3 rounded-[14px] border border-positive bg-bg-card px-4 py-3 text-sm font-semibold text-positive">{hoursMessage}</p>}

          {/* Modal no estilo iFood ("Disponível quando"): círculo por dia
              pra ligar/desligar rápido, seções expansíveis só pros dias
              ativos, dropdown de horário (não <input type=time> — cada
              navegador desenha o próprio, aqui é sempre a mesma cara). */}
          <MoSheet
            open={horariosModalAberto}
            onOpenChange={setHorariosModalAberto}
            title="Horários"
            description="Configure a semana como a cozinha trabalha. Turno que fecha depois da meia-noite também vale."
            footer={
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="text-sm font-semibold text-brand-strong"
                  onClick={() =>
                    setHours((prev) => ({
                      ...prev,
                      monday: [{ opens: '18:00', closes: '23:00' }],
                      tuesday: [{ opens: '18:00', closes: '23:00' }],
                      wednesday: [{ opens: '18:00', closes: '23:00' }],
                      thursday: [{ opens: '18:00', closes: '23:00' }],
                      friday: [{ opens: '18:00', closes: '23:00' }],
                      saturday: [{ opens: '18:00', closes: '23:00' }],
                    }))
                  }
                >
                  Usar 18h-23h, seg a sáb
                </button>
                <MoButton disabled={busy === 'hours'} onClick={() => void saveHours()}>
                  {busy === 'hours' ? 'Salvando…' : 'Concluir'}
                </MoButton>
              </div>
            }
          >
            <div className="flex flex-col gap-6 pb-4">
              <div>
                <p className="text-sm font-semibold text-text">Dias da semana</p>
                <div className="mt-3 flex gap-2">
                  {DAY_CIRCLES.map(({ key, letter, label }) => {
                    const ativo = hours[key].length > 0;
                    return (
                      <button
                        key={key}
                        type="button"
                        aria-label={`${label}: ${ativo ? 'aberto' : 'fechado'}, toque pra ${ativo ? 'fechar' : 'abrir'}`}
                        aria-pressed={ativo}
                        onClick={() => toggleDia(key, setHours)}
                        className={`flex h-10 w-10 items-center justify-center rounded-full border text-sm font-semibold transition-colors ${
                          ativo ? 'border-brand bg-brand text-on-brand' : 'border-border text-text-muted hover:border-border-strong'
                        }`}
                      >
                        {letter}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-col gap-4">
                {DAYS.filter(({ key }) => hours[key].length > 0).map(({ key, label }) => {
                  const recolhido = diasRecolhidos.has(key);
                  return (
                    <div key={key}>
                      <button
                        type="button"
                        className="flex items-center gap-2 text-sm font-semibold text-text"
                        aria-expanded={!recolhido}
                        onClick={() =>
                          setDiasRecolhidos((prev) => {
                            const next = new Set(prev);
                            if (next.has(key)) next.delete(key);
                            else next.add(key);
                            return next;
                          })
                        }
                      >
                        {recolhido ? <ChevronRight className="h-4 w-4" aria-hidden="true" /> : <ChevronDown className="h-4 w-4" aria-hidden="true" />}
                        {label === 'Seg' ? 'Segunda-feira' : label === 'Ter' ? 'Terça-feira' : label === 'Qua' ? 'Quarta-feira' : label === 'Qui' ? 'Quinta-feira' : label === 'Sex' ? 'Sexta-feira' : label === 'Sáb' ? 'Sábado' : 'Domingo'}
                      </button>
                      {!recolhido && (
                        <div className="mt-2 flex flex-col gap-2 pl-6">
                          {hours[key].map((shift, index) => (
                            <div key={`${key}-${index}`} className="flex items-center gap-2">
                              <select
                                aria-label={`${label} — início do turno ${index + 1}`}
                                className="h-10 rounded-[10px] border border-border bg-bg px-2 text-sm outline-none focus:border-brand"
                                value={shift.opens}
                                onChange={(event) => updateShift(key, index, 'opens', event.target.value, setHours)}
                              >
                                {timeOptionsFor(shift.opens).map((time) => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <select
                                aria-label={`${label} — fim do turno ${index + 1}`}
                                className="h-10 rounded-[10px] border border-border bg-bg px-2 text-sm outline-none focus:border-brand"
                                value={shift.closes}
                                onChange={(event) => updateShift(key, index, 'closes', event.target.value, setHours)}
                              >
                                {timeOptionsFor(shift.closes).map((time) => (
                                  <option key={time} value={time}>{time}</option>
                                ))}
                              </select>
                              <button
                                type="button"
                                aria-label={`Remover turno de ${label}`}
                                className="flex h-10 w-10 items-center justify-center text-text-muted hover:text-critical"
                                onClick={() => removeShift(key, index, setHours)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          ))}
                          <button
                            type="button"
                            className="flex w-fit items-center gap-1 text-sm font-semibold text-brand-strong"
                            onClick={() => setHours((prev) => ({ ...prev, [key]: [...prev[key], { opens: '11:00', closes: '15:00' }] }))}
                          >
                            <Plus className="h-4 w-4" aria-hidden="true" />
                            Horário
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
                {DAYS.every(({ key }) => hours[key].length === 0) && (
                  <p className="text-sm text-text-muted">Nenhum dia ligado ainda — toque num círculo acima pra abrir a semana.</p>
                )}
              </div>
            </div>
          </MoSheet>
        </section>

        <section id="entrega" className="rounded-[20px] border border-border bg-bg-card p-5">
          <h2 className="text-2xl font-semibold">Entrega</h2>
          <p className="mt-1 text-sm text-text-muted">Cadastre ao menos uma área simples para liberar o checkout do delivery.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-8">
            <input className="h-12 rounded-[14px] border border-border bg-bg px-3 md:col-span-2" value={zoneDraft.name} onChange={(event) => setZoneDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Centro" />
            <input className="h-12 rounded-[14px] border border-border bg-bg px-3" value={zoneDraft.city} onChange={(event) => setZoneDraft((prev) => ({ ...prev, city: event.target.value }))} placeholder="Cidade" />
            <input className="h-12 rounded-[14px] border border-border bg-bg px-3" value={zoneDraft.state} onChange={(event) => setZoneDraft((prev) => ({ ...prev, state: event.target.value.toUpperCase().slice(0, 2) }))} placeholder="UF" />
            <MoneyInput value={zoneDraft.fee} onChange={(value) => setZoneDraft((prev) => ({ ...prev, fee: value }))} placeholder="Taxa" />
            <input type="number" min="0" className="h-12 rounded-[14px] border border-border bg-bg px-3" value={zoneDraft.etaMin} onChange={(event) => setZoneDraft((prev) => ({ ...prev, etaMin: event.target.value }))} placeholder="Mín. min" />
            <input type="number" min="0" className="h-12 rounded-[14px] border border-border bg-bg px-3" value={zoneDraft.etaMax} onChange={(event) => setZoneDraft((prev) => ({ ...prev, etaMax: event.target.value }))} placeholder="Máx. min" />
            <button className="rounded-[14px] bg-brand px-4 font-semibold text-on-brand" onClick={() => void addZone()}>Adicionar</button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {zones.map((zone) => <span key={zone.id} className="rounded-full border border-border px-3 py-1 text-sm">{zone.name}: {centsToBRL(zone.feeCents)} · {zone.etaMinMinutes}-{zone.etaMaxMinutes}min</span>)}
          </div>
        </section>
      </div>
    </main>
  );
}

function Field({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input className="mt-2 h-12 w-full rounded-[14px] border border-border bg-bg px-4 outline-none focus:border-brand" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function MoneyField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (value: string) => void; placeholder?: string }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <MoneyInput value={value} onChange={onChange} placeholder={placeholder} className="mt-2" />
    </label>
  );
}

function MoneyInput({ value, onChange, placeholder, className = '' }: { value: string; onChange: (value: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={`flex h-12 items-center rounded-[14px] border border-border bg-bg px-3 focus-within:border-brand ${className}`}>
      <span className="mr-2 text-sm font-semibold text-text-muted">R$</span>
      <input
        className="h-full min-w-0 flex-1 bg-transparent outline-none"
        inputMode="decimal"
        value={value.replace(/^R\$\s?/, '')}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function updateShift(day: DayOfWeek, index: number, field: 'opens' | 'closes', value: string, setHours: (fn: (prev: HoursDraft) => HoursDraft) => void) {
  setHours((prev) => ({
    ...prev,
    [day]: prev[day].map((shift, shiftIndex) => (shiftIndex === index ? { ...shift, [field]: value } : shift)),
  }));
}

function removeShift(day: DayOfWeek, index: number, setHours: (fn: (prev: HoursDraft) => HoursDraft) => void) {
  setHours((prev) => ({
    ...prev,
    [day]: prev[day].filter((_, shiftIndex) => shiftIndex !== index),
  }));
}

/** Círculo do dia (padrão iFood): sem turno nenhum ainda = liga com um turno
 * padrão; com turno = desliga (limpa a lista). Nada é persistido até
 * "Concluir"/"Salvar horários" — reabrir o modal sem salvar não perde o
 * horário que já estava gravado no servidor. */
function toggleDia(day: DayOfWeek, setHours: (fn: (prev: HoursDraft) => HoursDraft) => void) {
  setHours((prev) => ({
    ...prev,
    [day]: prev[day].length > 0 ? [] : [{ opens: '18:00', closes: '23:00' }],
  }));
}

/** `<select>` sempre precisa ter a option do valor atual — sem isso, um
 * horário salvo fora da grade de 30min (import de planilha, dado antigo)
 * "sumiria" silenciosamente pro primeiro item da lista ao abrir o modal. */
function timeOptionsFor(value: string): string[] {
  return TIME_OPTIONS.includes(value) ? TIME_OPTIONS : [...TIME_OPTIONS, value].sort();
}
