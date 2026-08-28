'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, CircleDashed } from 'lucide-react';
import Link from 'next/link';
import type { DayOfWeek, Shift, StoreSetup, UpdateStoreSetupInput } from '@molho/contracts';
import { getStaffSession } from '../../../lib/staff-session';
import { centsToBRL } from '../../../lib/format';
import { fetchMyStores, type StaffStore } from '../../../lib/my-stores-api';
import { fetchStoreSetup, saveStoreSetup } from '../../../lib/store-setup-api';
import { fetchStoreHours, saveStoreHours } from '../../../lib/store-hours-api';
import { createDeliveryZone, fetchDeliveryZones, type DeliveryZoneResponse } from '../../../lib/delivery-zones-api';
import {
  createCategory,
  createModifier,
  createModifierGroup,
  createProduct,
  deleteProduct,
  downloadCatalogTemplate,
  fetchCategories,
  fetchModifierGroups,
  fetchModifiers,
  fetchProducts,
  fetchProductImages,
  importCatalog,
  setProductAvailability,
  updateProduct,
  uploadProductImage,
  type Category,
  type Modifier,
  type ModifierGroup,
  type Product,
  type ProductImage,
} from '../../../lib/catalog-api';

const DAYS: Array<{ key: DayOfWeek; label: string }> = [
  { key: 'monday', label: 'Seg' },
  { key: 'tuesday', label: 'Ter' },
  { key: 'wednesday', label: 'Qua' },
  { key: 'thursday', label: 'Qui' },
  { key: 'friday', label: 'Sex' },
  { key: 'saturday', label: 'Sáb' },
  { key: 'sunday', label: 'Dom' },
];

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

export default function ConfiguracaoPage() {
  const [stores, setStores] = useState<StaffStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [setup, setSetup] = useState<StoreSetup | null>(null);
  const [storeForm, setStoreForm] = useState<UpdateStoreSetupInput>(emptyStoreForm);
  const [hours, setHours] = useState<HoursDraft>(EMPTY_HOURS);
  const [zones, setZones] = useState<DeliveryZoneResponse[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Record<string, Modifier[]>>({});
  const [images, setImages] = useState<ProductImage[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [productDraft, setProductDraft] = useState({ categoryId: '', name: '', description: '', price: '', photo: null as File | null });
  const [editDraft, setEditDraft] = useState({ categoryId: '', name: '', description: '', price: '' });
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [groupDraft, setGroupDraft] = useState({ name: '', min: '0', max: '1' });
  const [modifierDraft, setModifierDraft] = useState<Record<string, { name: string; price: string }>>({});
  const [zoneDraft, setZoneDraft] = useState({ name: '', city: '', state: '', fee: '', etaMin: '30', etaMax: '60' });
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [hoursMessage, setHoursMessage] = useState<string | null>(null);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const manualTotalCents = useMemo(() => {
    if (!selectedProduct) return 0;
    return selectedProduct.basePriceCents + Object.values(modifiers).flat().reduce((sum, item) => sum + item.priceDeltaCents, 0);
  }, [modifiers, selectedProduct]);

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
  // Campos de pagamento vivem na seção #loja, não numa #pagamento própria
  // (mesmo ajuste que a grade de chips antiga já fazia) — sem isso o CTA
  // "Completar Pagamento" levaria pra uma âncora que não existe.
  const nextStepAnchor = nextStep === 'pagamento' ? 'loja' : nextStep;

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
        setProductDraft((prev) => ({ ...prev, categoryId: loadedCategories[0]?.id ?? '' }));
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
      .then((lists) => {
        const flat = lists.flat();
        setProducts(flat);
        setSelectedProductId((current) => current || flat[0]?.id || '');
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar produtos.'));
  }, [categories]);

  useEffect(() => {
    if (!selectedProduct) {
      setEditDraft({ categoryId: '', name: '', description: '', price: '' });
      return;
    }
    setEditDraft({
      categoryId: selectedProduct.categoryId,
      name: selectedProduct.name,
      description: selectedProduct.description ?? '',
      price: centsToBRL(selectedProduct.basePriceCents),
    });
  }, [selectedProduct]);

  useEffect(() => {
    if (!selectedProductId) {
      setGroups([]);
      setModifiers({});
      setImages([]);
      return;
    }
    async function loadProductDetails() {
      const [loadedGroups, loadedImages] = await Promise.all([fetchModifierGroups(selectedProductId), fetchProductImages(selectedProductId)]);
      const modifierEntries = await Promise.all(loadedGroups.map(async (group) => [group.id, await fetchModifiers(group.id)] as const));
      setGroups(loadedGroups);
      setImages(loadedImages);
      setModifiers(Object.fromEntries(modifierEntries));
    }
    loadProductDetails().catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar complementos.'));
  }, [selectedProductId]);

  async function saveStore() {
    if (!storeId) return;
    setBusy('store');
    setError(null);
    try {
      const saved = await saveStoreSetup(storeId, storeForm);
      setSetup(saved);
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
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar horários.');
    } finally {
      setBusy(null);
    }
  }

  async function addCategory() {
    if (!categoryName.trim()) return;
    setBusy('category');
    try {
      const created = await createCategory({ name: categoryName.trim(), sortOrder: categories.length });
      setCategories((prev) => [...prev, created]);
      setProductDraft((prev) => ({ ...prev, categoryId: prev.categoryId || created.id }));
      setCategoryName('');
      setMessage('Categoria criada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar categoria.');
    } finally {
      setBusy(null);
    }
  }

  async function addProduct() {
    if (!productDraft.categoryId || !productDraft.name.trim()) return;
    setBusy('product');
    setCatalogMessage(null);
    try {
      const created = await createProduct({
        categoryId: productDraft.categoryId,
        name: productDraft.name.trim(),
        description: productDraft.description.trim() || undefined,
        basePriceCents: brlToCents(productDraft.price),
        sortOrder: products.length,
      });
      if (productDraft.photo) await uploadProductImage(created.id, productDraft.photo);
      await reloadProducts(created.id);
      setSelectedProductId(created.id);
      setProductDraft({ categoryId: productDraft.categoryId, name: '', description: '', price: '', photo: null });
      setCatalogMessage(`Item "${created.name}" adicionado ao cardápio.`);
      setMessage('Produto adicionado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar produto.');
    } finally {
      setBusy(null);
    }
  }

  async function saveSelectedProduct() {
    if (!selectedProduct || !editDraft.categoryId || !editDraft.name.trim()) return;
    setBusy('product-edit');
    setCatalogMessage(null);
    try {
      const updated = await updateProduct(selectedProduct, {
        categoryId: editDraft.categoryId,
        name: editDraft.name.trim(),
        description: editDraft.description.trim() || null,
        basePriceCents: brlToCents(editDraft.price),
      });
      await reloadProducts(updated.id);
      setCatalogMessage(`Item "${updated.name}" atualizado.`);
      setMessage('Produto atualizado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar produto.');
    } finally {
      setBusy(null);
    }
  }

  async function uploadSelectedProductPhoto() {
    if (!selectedProduct || !editPhoto) return;
    setBusy('product-photo');
    setCatalogMessage(null);
    try {
      const created = await uploadProductImage(selectedProduct.id, editPhoto);
      setImages((prev) => [...prev, created]);
      setEditPhoto(null);
      setCatalogMessage(`Foto adicionada em "${selectedProduct.name}".`);
      setMessage('Foto adicionada.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar a foto.');
    } finally {
      setBusy(null);
    }
  }

  async function removeProduct(productToRemove: Product) {
    const confirmed = window.confirm(`Remover "${productToRemove.name}" do cardápio?`);
    if (!confirmed) return;
    setBusy('product-delete');
    setCatalogMessage(null);
    try {
      await deleteProduct(productToRemove);
      await reloadProducts();
      setGroups([]);
      setModifiers({});
      setImages([]);
      setCatalogMessage(`Item "${productToRemove.name}" removido do cardápio.`);
      setMessage('Produto removido.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover produto.');
    } finally {
      setBusy(null);
    }
  }

  async function reloadProducts(preferredProductId?: string) {
    if (categories.length === 0) {
      setProducts([]);
      setSelectedProductId('');
      return;
    }
    const lists = await Promise.all(categories.map((category) => fetchProducts(category.id)));
    const flat = lists.flat();
    setProducts(flat);
    setSelectedProductId((current) => {
      if (preferredProductId && flat.some((product) => product.id === preferredProductId)) return preferredProductId;
      if (current && flat.some((product) => product.id === current)) return current;
      return flat[0]?.id ?? '';
    });
  }

  async function addGroup() {
    if (!selectedProductId || !groupDraft.name.trim()) return;
    setBusy('group');
    try {
      const created = await createModifierGroup({
        productId: selectedProductId,
        name: groupDraft.name.trim(),
        min: Number(groupDraft.min || 0),
        max: Number(groupDraft.max || 1),
      });
      setGroups((prev) => [...prev, created]);
      setModifierDraft((prev) => ({ ...prev, [created.id]: { name: '', price: '' } }));
      setGroupDraft({ name: '', min: '0', max: '1' });
      setMessage('Grupo criado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar grupo.');
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
      setMessage('Variação/adicional criado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar variação/adicional.');
    } finally {
      setBusy(null);
    }
  }

  async function applyPizzaTemplate() {
    if (!selectedProductId) return;
    setBusy('pizza-template');
    setCatalogMessage(null);
    try {
      const tamanho = await createModifierGroup({ productId: selectedProductId, name: 'Tamanho', min: 1, max: 1 });
      const sabores = await createModifierGroup({ productId: selectedProductId, name: 'Sabores possíveis', min: 1, max: 2 });
      const adicionais = await createModifierGroup({ productId: selectedProductId, name: 'Adicionais e remoções', min: 0, max: 8 });
      const defaults = await Promise.all([
        createModifier({ groupId: tamanho.id, name: 'Pequena - 4 pedaços / 1 sabor', priceDeltaCents: 0 }),
        createModifier({ groupId: tamanho.id, name: 'Média - 6 pedaços / até 2 sabores', priceDeltaCents: 1000 }),
        createModifier({ groupId: tamanho.id, name: 'Grande - 8 pedaços / até 2 sabores', priceDeltaCents: 1800 }),
        createModifier({ groupId: adicionais.id, name: 'Extra queijo', priceDeltaCents: 500 }),
        createModifier({ groupId: adicionais.id, name: 'Remover cebola', priceDeltaCents: 0 }),
      ]);
      const byGroup = defaults.reduce<Record<string, Modifier[]>>((acc, item) => {
        acc[item.groupId] = [...(acc[item.groupId] ?? []), item];
        return acc;
      }, {});
      setGroups((prev) => [...prev, tamanho, sabores, adicionais]);
      setModifiers((prev) => ({ ...prev, ...byGroup, [sabores.id]: [] }));
      setModifierDraft((prev) => ({
        ...prev,
        [tamanho.id]: { name: '', price: '' },
        [sabores.id]: { name: '', price: '' },
        [adicionais.id]: { name: '', price: '' },
      }));
      setCatalogMessage('Estrutura de pizza criada. Adicione os sabores no grupo "Sabores possíveis" e ajuste os valores incrementais por tamanho ou sabor.');
      setMessage('Modelo de pizza aplicado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar o modelo de pizza.');
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
                  <a href={`#${nextStepAnchor}`} className="rounded-[14px] bg-brand px-4 py-2 text-sm font-semibold text-on-brand">Completar {stepLabel(nextStep)}</a>
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
                  href={`#${key === 'pagamento' ? 'loja' : key}`}
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
              <p className="mt-1 text-sm text-text-muted">Configure a semana como a cozinha trabalha. Turno que fecha depois da meia-noite também vale.</p>
            </div>
            <button className="rounded-[14px] border border-border px-4 py-2 text-sm font-semibold" onClick={() => setHours((prev) => ({ ...prev, monday: [{ opens: '18:00', closes: '23:00' }], tuesday: [{ opens: '18:00', closes: '23:00' }], wednesday: [{ opens: '18:00', closes: '23:00' }], thursday: [{ opens: '18:00', closes: '23:00' }], friday: [{ opens: '18:00', closes: '23:00' }], saturday: [{ opens: '18:00', closes: '23:00' }] }))}>Usar 18h-23h, seg a sáb</button>
          </div>
          <div className="mt-5 space-y-3">
            {DAYS.map(({ key, label }) => (
              <div key={key} className="rounded-[14px] border border-border bg-bg p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-semibold">{label}</p>
                  <button className="text-sm font-semibold text-brand-strong" onClick={() => setHours((prev) => ({ ...prev, [key]: [...prev[key], { opens: '11:00', closes: '15:00' }] }))}>Adicionar turno</button>
                </div>
                {hours[key].length === 0 ? <p className="mt-3 text-sm text-text-muted">Fechado</p> : null}
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  {hours[key].map((shift, index) => (
                    <div key={`${key}-${index}`} className="flex items-center gap-2">
                      <input type="time" className="h-11 rounded-[14px] border border-border bg-bg-card px-3" value={shift.opens} onChange={(event) => updateShift(key, index, 'opens', event.target.value, setHours)} />
                      <span>até</span>
                      <input type="time" className="h-11 rounded-[14px] border border-border bg-bg-card px-3" value={shift.closes} onChange={(event) => updateShift(key, index, 'closes', event.target.value, setHours)} />
                      <button className="rounded-[14px] border border-border px-3 py-2 text-sm" onClick={() => removeShift(key, index, setHours)}>Remover</button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <button className="mt-5 rounded-[14px] bg-brand px-5 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy === 'hours'} onClick={() => void saveHours()}>
            {busy === 'hours' ? 'Salvando…' : 'Salvar horários'}
          </button>
          {hoursMessage && <p role="status" className="mt-3 rounded-[14px] border border-positive bg-bg-card px-4 py-3 text-sm font-semibold text-positive">{hoursMessage}</p>}
        </section>

        <section id="cardapio" className="rounded-[20px] border border-border bg-bg-card p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-2xl font-semibold">Cardápio manual</h2>
              <p className="mt-1 text-sm text-text-muted">Comece pelo carro-chefe da casa. Depois organize variações, adicionais e fotos.</p>
            </div>
            <span className="rounded-full border border-border px-3 py-1 text-sm font-semibold">{products.length} item(ns)</span>
          </div>
          <div className="mt-5 grid gap-4 lg:grid-cols-[1fr_1.5fr]">
            <div className="space-y-4">
              <div className="rounded-[14px] border border-border bg-bg p-4">
                <h3 className="font-semibold">Categoria</h3>
                <div className="mt-3 flex gap-2">
                  <input className="h-12 flex-1 rounded-[14px] border border-border bg-bg-card px-4" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} placeholder="Hambúrgueres" />
                  <button className="rounded-[14px] bg-brand px-4 font-semibold text-on-brand" onClick={() => void addCategory()}>Adicionar</button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {categories.map((category) => <span key={category.id} className="rounded-full border border-border px-3 py-1 text-sm">{category.name}</span>)}
                </div>
              </div>
              <div className="rounded-[14px] border border-border bg-bg p-4">
                <h3 className="font-semibold">Produto</h3>
                <div className="mt-3 grid gap-3">
                  <select className="h-12 rounded-[14px] border border-border bg-bg-card px-3" value={productDraft.categoryId} onChange={(event) => setProductDraft((prev) => ({ ...prev, categoryId: event.target.value }))}>
                    <option value="">Categoria</option>
                    {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                  </select>
                  <input className="h-12 rounded-[14px] border border-border bg-bg-card px-4" value={productDraft.name} onChange={(event) => setProductDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Xis coração" />
                  <textarea className="min-h-24 rounded-[14px] border border-border bg-bg-card px-4 py-3" value={productDraft.description} onChange={(event) => setProductDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="Pão, coração, milho, ervilha..." />
                  <MoneyInput value={productDraft.price} onChange={(value) => setProductDraft((prev) => ({ ...prev, price: value }))} placeholder="29,90" />
                  <input type="file" accept="image/*" className="rounded-[14px] border border-border bg-bg-card p-3" onChange={(event) => setProductDraft((prev) => ({ ...prev, photo: event.target.files?.[0] ?? null }))} />
                  <button className="rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand" onClick={() => void addProduct()}>Adicionar produto</button>
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="rounded-[14px] border border-border bg-bg p-4">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Produtos cadastrados</h3>
                  <span className="text-sm text-text-muted">{products.filter((product) => product.available).length} vendável(is)</span>
                </div>
                {catalogMessage && <p role="status" className="mt-3 rounded-[14px] border border-positive bg-bg-card px-4 py-3 text-sm font-semibold text-positive">{catalogMessage}</p>}
                <div className="mt-3 grid gap-2">
                  {products.length === 0 && (
                    <div className="rounded-[14px] border border-dashed border-border bg-bg-card p-5">
                      <p className="font-semibold">Nenhum prato por aqui ainda.</p>
                      <p className="mt-1 text-sm text-text-muted">Cadastre o campeão de vendas primeiro: foto, nome direto, descrição curta e preço redondo.</p>
                    </div>
                  )}
                  {products.map((product) => {
                    const expanded = selectedProductId === product.id && selectedProduct?.id === product.id;
                    return (
                      <div key={product.id} className={`rounded-[14px] border ${expanded ? 'border-brand bg-brand-faint' : 'border-border bg-bg-card'}`}>
                        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <button className="flex-1 text-left" onClick={() => setSelectedProductId(expanded ? '' : product.id)}>
                            <span className="font-semibold">{product.name}</span>
                            <span className="ml-2 text-sm text-text-muted">{centsToBRL(product.basePriceCents)}</span>
                            <span className={`ml-2 rounded-full px-2 py-0.5 text-xs font-semibold ${product.available ? 'bg-positive/10 text-positive' : 'bg-bg text-text-muted'}`}>
                              {product.available ? 'ativo' : 'esgotado'}
                            </span>
                          </button>
                          <div className="flex gap-2">
                            <button className="rounded-[14px] border border-border px-3 py-2 text-sm font-semibold" onClick={() => setSelectedProductId(expanded ? '' : product.id)}>{expanded ? 'Fechar' : 'Editar'}</button>
                            <button className="rounded-[14px] border border-critical px-3 py-2 text-sm font-semibold text-critical" onClick={() => { setSelectedProductId(product.id); void removeProduct(product); }}>Remover</button>
                          </div>
                        </div>
                        {expanded && (
                          <div className="border-t border-border p-4">
                            <div className="grid gap-3 md:grid-cols-2">
                              <select className="h-11 rounded-[14px] border border-border bg-bg px-3" value={editDraft.categoryId} onChange={(event) => setEditDraft((prev) => ({ ...prev, categoryId: event.target.value }))}>
                                {categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                              </select>
                              <input className="h-11 rounded-[14px] border border-border bg-bg px-3" value={editDraft.name} onChange={(event) => setEditDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Nome do item" />
                              <MoneyInput value={editDraft.price} onChange={(value) => setEditDraft((prev) => ({ ...prev, price: value }))} placeholder="29,90" />
                              <button className="rounded-[14px] border border-border px-3 py-2 text-sm font-semibold" onClick={() => void setProductAvailability(product, !product.available).then((updated) => setProducts((prev) => prev.map((item) => item.id === updated.id ? updated : item)))}>
                                {product.available ? 'Marcar esgotado' : 'Reativar'}
                              </button>
                              <textarea className="min-h-24 rounded-[14px] border border-border bg-bg px-3 py-3 md:col-span-2" value={editDraft.description} onChange={(event) => setEditDraft((prev) => ({ ...prev, description: event.target.value }))} placeholder="Descrição" />
                            </div>
                            <div className="mt-3 flex flex-wrap gap-2">
                              <button className="rounded-[14px] bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50" disabled={busy === 'product-edit'} onClick={() => void saveSelectedProduct()}>
                                {busy === 'product-edit' ? 'Salvando…' : 'Salvar item'}
                              </button>
                              <button className="rounded-[14px] border border-border px-4 py-2 text-sm font-semibold disabled:opacity-50" disabled={busy === 'pizza-template'} onClick={() => void applyPizzaTemplate()}>
                                Montar como pizza
                              </button>
                            </div>
                            <div className="mt-5">
                              <p className="text-sm font-semibold">Fotos do item</p>
                              <div className="mt-2 flex flex-wrap gap-3">
                                {images.map((image) => (
                                  <div key={image.id} className="h-24 w-24 overflow-hidden rounded-[14px] border border-border bg-bg">
                                    {image.imageUrl ? <img src={image.imageUrl} alt={`Foto de ${selectedProduct.name}`} width={96} height={96} className="h-full w-full object-cover" /> : <div className="flex h-full items-center justify-center px-2 text-center text-xs text-text-muted">Foto salva</div>}
                                  </div>
                                ))}
                                {images.length === 0 && <div className="flex h-24 min-w-44 items-center rounded-[14px] border border-dashed border-border px-3 text-sm text-text-muted">Nenhuma foto cadastrada.</div>}
                              </div>
                              <div className="mt-3 flex flex-col gap-2 md:flex-row">
                                <input type="file" accept="image/*" className="rounded-[14px] border border-border bg-bg p-3" onChange={(event) => setEditPhoto(event.target.files?.[0] ?? null)} />
                                <button className="rounded-[14px] border border-border px-4 py-2 font-semibold disabled:opacity-50" disabled={!editPhoto || busy === 'product-photo'} onClick={() => void uploadSelectedProductPhoto()}>
                                  {busy === 'product-photo' ? 'Enviando…' : 'Adicionar foto'}
                                </button>
                              </div>
                            </div>
                            <div className="mt-5">
                              <div className="flex items-center justify-between gap-3">
                                <div>
                                  <p className="font-semibold">Variações, adicionais e remoções</p>
                                  <p className="text-sm text-text-muted">Use grupos para tamanho, sabores, extras pagos ou opções sem custo como “sem salada”. Total exemplo: {centsToBRL(manualTotalCents)}</p>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 md:grid-cols-4">
                                <input className="h-12 rounded-[14px] border border-border bg-bg-card px-3" value={groupDraft.name} onChange={(event) => setGroupDraft((prev) => ({ ...prev, name: event.target.value }))} placeholder="Tamanho ou adicionais" />
                                <input className="h-12 rounded-[14px] border border-border bg-bg-card px-3" value={groupDraft.min} onChange={(event) => setGroupDraft((prev) => ({ ...prev, min: event.target.value }))} placeholder="Mín." />
                                <input className="h-12 rounded-[14px] border border-border bg-bg-card px-3" value={groupDraft.max} onChange={(event) => setGroupDraft((prev) => ({ ...prev, max: event.target.value }))} placeholder="Máx." />
                                <button className="rounded-[14px] bg-brand px-4 font-semibold text-on-brand" onClick={() => void addGroup()}>Criar grupo</button>
                              </div>
                              <div className="mt-4 space-y-3">
                                {groups.map((group) => (
                                  <div key={group.id} className="rounded-[14px] border border-border bg-bg-card p-4">
                                    <p className="font-semibold">{group.name} <span className="text-sm font-normal text-text-muted">mín. {group.min}, máx. {group.max}</span></p>
                                    <div className="mt-3 flex flex-wrap gap-2">
                                      {(modifiers[group.id] ?? []).map((item) => <span key={item.id} className="rounded-full border border-border px-3 py-1 text-sm">{item.name} {item.priceDeltaCents > 0 ? `+${centsToBRL(item.priceDeltaCents)}` : 'sem custo'}</span>)}
                                    </div>
                                    <div className="mt-3 grid gap-2 md:grid-cols-[1fr_160px_120px]">
                                      <input className="h-11 rounded-[14px] border border-border bg-bg px-3" value={modifierDraft[group.id]?.name ?? ''} onChange={(event) => setModifierDraft((prev) => ({ ...prev, [group.id]: { ...(prev[group.id] ?? { price: '' }), name: event.target.value } }))} placeholder="Extra queijo / Sem salada / Calabresa" />
                                      <MoneyInput value={modifierDraft[group.id]?.price ?? ''} onChange={(value) => setModifierDraft((prev) => ({ ...prev, [group.id]: { ...(prev[group.id] ?? { name: '' }), price: value } }))} placeholder="4,00" />
                                      <button className="rounded-[14px] border border-border font-semibold" onClick={() => void addModifier(group.id)}>Adicionar</button>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-wrap gap-3">
            <button className="rounded-[14px] border border-border px-4 py-3 font-semibold" onClick={() => void downloadCatalogTemplate().then((blob) => downloadBlob(blob, 'modelo-cardapio.csv'))}>Baixar modelo</button>
            <label className="rounded-[14px] border border-border px-4 py-3 font-semibold">
              Importar planilha
              <input type="file" accept=".csv,.xlsx" className="hidden" onChange={(event) => event.target.files?.[0] && void importCatalog(event.target.files[0]).then(() => setMessage('Planilha importada. Recarregue para conferir.')).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha ao importar.'))} />
            </label>
          </div>
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

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
