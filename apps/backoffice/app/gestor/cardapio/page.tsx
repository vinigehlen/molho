'use client';

import { MoBadge, MoButton, MoChip, MoEmptyState, MoSkeleton, cn } from '@molho/ui';
import {
  ArrowDown,
  ArrowUp,
  Check,
  ChevronLeft,
  ChevronRight,
  Download,
  FileSpreadsheet,
  ImageIcon,
  PackageOpen,
  Pencil,
  Plus,
  Search,
  Trash2,
  UtensilsCrossed,
  X,
} from 'lucide-react';
import Link from 'next/link';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ProductOffersEditor } from './product-offers-editor';
import { brlToCents, centsToBRL } from '../../../lib/format';
import { getStaffSession } from '../../../lib/staff-session';
import {
  createCategory,
  createModifier,
  createModifierGroup,
  createProduct,
  deleteProduct,
  deleteProductImage,
  downloadCatalogTemplate,
  fetchAllModifierGroups,
  fetchCategories,
  fetchModifierGroups,
  fetchModifiers,
  fetchProductImages,
  fetchProducts,
  linkModifierGroupToProduct,
  reorderProductImage,
  setModifierGroupActive,
  setProductAvailability,
  unlinkModifierGroupFromProduct,
  updateProduct,
  uploadProductImage,
  type Category,
  type Modifier,
  type ModifierGroup,
  type ModifierGroupWithProduct,
  type Product,
  type ProductImage,
  type ProductKind,
} from '../../../lib/catalog-api';

/** Fase 3 do combo (exceção MVP 2026-08-28): `combo` existe no schema mas só
 * é criável na fase 4 — o gestor escolhe entre prato feito e industrializado. */
const CATALOG_PRODUCT_KINDS: { value: ProductKind; label: string }[] = [
  { value: 'prepared', label: 'Preparado na cozinha' },
  { value: 'industrialized', label: 'Industrializado (revenda)' },
];

function productKindLabel(kind: ProductKind): string {
  return CATALOG_PRODUCT_KINDS.find((option) => option.value === kind)?.label ?? 'Combo';
}

const FIELD_CLASS =
  'w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm outline-none transition-colors placeholder:text-text-muted focus-visible:border-brand focus-visible:shadow-focus';
const ICON_BUTTON_CLASS =
  'inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] border border-border bg-bg-card text-text-muted transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-40';

type ProductFormStep = 0 | 1 | 2;

const PRODUCT_FORM_STEPS = ['Informações', 'Venda', 'Foto e revisão'] as const;

function isMoneyDraftValid(value: string): boolean {
  const cents = brlToCents(value);
  return /\d/.test(value) && Number.isSafeInteger(cents);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

/**
 * Cardápio ganhou aba própria (era uma seção dentro de Configuração) —
 * cadastrar/organizar item é trabalho do dia a dia, não passo de setup
 * único. Categoria/produto são escopados por TENANT (X-Tenant-Id), não por
 * loja — diferente de Horários/Entrega/PIX, que ficam em Configuração e
 * dependem de qual loja do tenant está selecionada.
 */
export default function CardapioPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState('all');
  const [salesFilter, setSalesFilter] = useState<'all' | 'available' | 'unavailable'>('all');
  const [creatingProduct, setCreatingProduct] = useState(false);
  const [productFormStep, setProductFormStep] = useState<ProductFormStep>(0);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [wideInspector, setWideInspector] = useState(false);
  const [selectedProductId, setSelectedProductId] = useState('');
  const [groups, setGroups] = useState<ModifierGroup[]>([]);
  const [modifiers, setModifiers] = useState<Record<string, Modifier[]>>({});
  // Reuso (exceção MVP 2026-08-28, fase 2/4): todos os grupos do tenant, pra
  // oferecer "vincular grupo existente" em vez de recriar do zero.
  const [allGroups, setAllGroups] = useState<ModifierGroupWithProduct[]>([]);
  const [linkGroupId, setLinkGroupId] = useState('');
  const [images, setImages] = useState<ProductImage[]>([]);
  const [categoryName, setCategoryName] = useState('');
  const [productDraft, setProductDraft] = useState({
    categoryId: '',
    name: '',
    description: '',
    price: '',
    pdvCode: '',
    kind: 'prepared' as ProductKind,
    photo: null as File | null,
  });
  const [editDraft, setEditDraft] = useState({
    categoryId: '',
    name: '',
    description: '',
    price: '',
    pdvCode: '',
    kind: 'prepared' as ProductKind,
  });
  const [editPhoto, setEditPhoto] = useState<File | null>(null);
  const [groupDraft, setGroupDraft] = useState({ name: '', min: '0', max: '1', pdvCode: '' });
  const [modifierDraft, setModifierDraft] = useState<
    Record<string, { name: string; price: string }>
  >({});
  const [busca, setBusca] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const inspectorRef = useRef<HTMLElement | null>(null);
  const inspectorTriggerRef = useRef<HTMLElement | null>(null);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const manualTotalCents = useMemo(() => {
    if (!selectedProduct) return 0;
    return (
      selectedProduct.basePriceCents +
      Object.values(modifiers)
        .flat()
        .reduce((sum, item) => sum + item.priceDeltaCents, 0)
    );
  }, [modifiers, selectedProduct]);

  const categoryById = useMemo(
    () => new Map(categories.map((category) => [category.id, category])),
    [categories],
  );

  const productCounts = useMemo(() => {
    const byCategory = new Map<string, number>();
    for (const product of products) {
      byCategory.set(product.categoryId, (byCategory.get(product.categoryId) ?? 0) + 1);
    }
    return {
      byCategory,
      available: products.filter((product) => product.available).length,
      unavailable: products.filter((product) => !product.available).length,
    };
  }, [products]);

  // Busca operacional: nome, descrição e código do PDV. Quem está no balcão
  // frequentemente tem o código em mãos, não o nome exato que foi publicado.
  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return products.filter((product) => {
      const inCategory = activeCategoryId === 'all' || product.categoryId === activeCategoryId;
      const inStatus =
        salesFilter === 'all' ||
        (salesFilter === 'available' && product.available) ||
        (salesFilter === 'unavailable' && !product.available);
      const searchable =
        `${product.name} ${product.description ?? ''} ${product.pdvCode ?? ''}`.toLowerCase();
      return inCategory && inStatus && (!termo || searchable.includes(termo));
    });
  }, [activeCategoryId, busca, products, salesFilter]);

  useEffect(() => {
    if (
      selectedProductId &&
      !produtosFiltrados.some((product) => product.id === selectedProductId)
    ) {
      setSelectedProductId('');
    }
  }, [produtosFiltrados, selectedProductId]);

  useEffect(() => {
    if (!window.matchMedia) return;
    const media = window.matchMedia('(min-width: 1280px)');
    const update = () => setWideInspector(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (!getStaffSession()) return;
    setBusy('load');
    setError(null);
    fetchCategories()
      .then((loaded) => {
        setCategories(loaded);
        setProductDraft((prev) => ({
          ...prev,
          categoryId: prev.categoryId || loaded[0]?.id || '',
        }));
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar categorias.'),
      )
      .finally(() => setBusy(null));
    fetchAllModifierGroups()
      .then(setAllGroups)
      .catch(() => {}); // não trava o cardápio se só a lista de reuso falhar
  }, []);

  useEffect(() => {
    if (categories.length === 0) {
      setProducts([]);
      setLoadingProducts(false);
      return;
    }
    setLoadingProducts(true);
    Promise.all(categories.map((category) => fetchProducts(category.id)))
      .then((lists) => {
        const flat = lists.flat();
        setProducts(flat);
        setSelectedProductId((current) =>
          flat.some((product) => product.id === current) ? current : '',
        );
      })
      .catch((cause) =>
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar produtos.'),
      )
      .finally(() => setLoadingProducts(false));
  }, [categories]);

  useEffect(() => {
    if (!selectedProduct) {
      setEditDraft({
        categoryId: '',
        name: '',
        description: '',
        price: '',
        pdvCode: '',
        kind: 'prepared',
      });
      return;
    }
    setEditDraft({
      categoryId: selectedProduct.categoryId,
      name: selectedProduct.name,
      description: selectedProduct.description ?? '',
      price: centsToBRL(selectedProduct.basePriceCents),
      pdvCode: selectedProduct.pdvCode ?? '',
      kind: selectedProduct.kind,
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
      const [loadedGroups, loadedImages] = await Promise.all([
        fetchModifierGroups(selectedProductId),
        fetchProductImages(selectedProductId),
      ]);
      const modifierEntries = await Promise.all(
        loadedGroups.map(async (group) => [group.id, await fetchModifiers(group.id)] as const),
      );
      setGroups(loadedGroups);
      setImages(loadedImages);
      setModifiers(Object.fromEntries(modifierEntries));
    }
    loadProductDetails().catch((cause) =>
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar complementos.'),
    );
  }, [selectedProductId]);

  async function addCategory() {
    if (!categoryName.trim()) return;
    setBusy('category');
    try {
      const created = await createCategory({
        name: categoryName.trim(),
        sortOrder: categories.length,
      });
      setCategories((prev) => [...prev, created]);
      setActiveCategoryId(created.id);
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
    setError(null);
    setCatalogMessage(null);
    try {
      const created = await createProduct({
        categoryId: productDraft.categoryId,
        name: productDraft.name.trim(),
        description: productDraft.description.trim() || undefined,
        basePriceCents: brlToCents(productDraft.price),
        pdvCode: productDraft.pdvCode.trim() || null,
        kind: productDraft.kind,
        sortOrder: products.length,
      });
      if (productDraft.photo) await uploadProductImage(created.id, productDraft.photo);
      await reloadProducts(created.id);
      setSelectedProductId(created.id);
      setCreatingProduct(false);
      setProductDraft({
        categoryId: productDraft.categoryId,
        name: '',
        description: '',
        price: '',
        pdvCode: '',
        kind: 'prepared',
        photo: null,
      });
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
    setError(null);
    setCatalogMessage(null);
    try {
      const updated = await updateProduct(selectedProduct, {
        categoryId: editDraft.categoryId,
        name: editDraft.name.trim(),
        description: editDraft.description.trim() || null,
        basePriceCents: brlToCents(editDraft.price),
        pdvCode: editDraft.pdvCode.trim() || null,
        kind: editDraft.kind,
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
    setError(null);
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

  /**
   * Cardápio mostra sempre a foto de `position` mais baixa como capa
   * (storefront.service.ts) — sem controle de ordem aqui, a foto nova
   * entrava sempre no FIM da galeria e nunca virava a capa que o cliente vê.
   * Troca (swap), não "pular pra 0": nunca cria duas fotos com a mesma
   * position (o backend não impede duplicata).
   */
  async function moveImage(image: ProductImage, direction: 'up' | 'down') {
    const sorted = [...images].sort((a, b) => a.position - b.position);
    const index = sorted.findIndex((item) => item.id === image.id);
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const other = sorted[targetIndex];
    if (!other || !selectedProduct) return;
    setBusy('product-photo-reorder');
    setCatalogMessage(null);
    try {
      const [updatedImage, updatedOther] = await Promise.all([
        reorderProductImage(selectedProduct.id, image, other.position),
        reorderProductImage(selectedProduct.id, other, image.position),
      ]);
      setImages((prev) =>
        prev.map((item) =>
          item.id === updatedImage.id
            ? updatedImage
            : item.id === updatedOther.id
              ? updatedOther
              : item,
        ),
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível reordenar a foto.');
    } finally {
      setBusy(null);
    }
  }

  async function removeImage(image: ProductImage) {
    if (!selectedProduct) return;
    const confirmed = window.confirm('Remover esta foto?');
    if (!confirmed) return;
    setBusy('product-photo-delete');
    setCatalogMessage(null);
    try {
      await deleteProductImage(selectedProduct.id, image);
      setImages((prev) => prev.filter((item) => item.id !== image.id));
      setCatalogMessage('Foto removida.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível remover a foto.');
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
      if (preferredProductId && flat.some((product) => product.id === preferredProductId))
        return preferredProductId;
      if (current && flat.some((product) => product.id === current)) return current;
      return '';
    });
  }

  /** Toggle rápido de disponibilidade direto na LINHA da lista — no iFood é
   * o "Status de venda" sem precisar abrir o item inteiro pra editar. */
  async function toggleAvailability(product: Product) {
    setBusy(`availability:${product.id}`);
    try {
      const updated = await setProductAvailability(product, !product.available);
      setProducts((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível atualizar disponibilidade.',
      );
    } finally {
      setBusy(null);
    }
  }

  function openProductCreation() {
    inspectorTriggerRef.current = document.activeElement as HTMLElement | null;
    setSelectedProductId('');
    setCreatingProduct(true);
    setProductFormStep(0);
    setError(null);
    setMessage(null);
    if (activeCategoryId !== 'all') {
      setProductDraft((prev) => ({ ...prev, categoryId: activeCategoryId }));
    }
  }

  function selectProductForEditing(productId: string) {
    if (selectedProductId === productId) {
      closeProductInspector();
      return;
    }
    inspectorTriggerRef.current = document.activeElement as HTMLElement | null;
    setCreatingProduct(false);
    setProductFormStep(0);
    setError(null);
    setMessage(null);
    setSelectedProductId(productId);
  }

  function closeProductInspector() {
    setCreatingProduct(false);
    setSelectedProductId('');
    setProductFormStep(0);
    queueMicrotask(() => inspectorTriggerRef.current?.focus());
  }

  async function downloadTemplate() {
    setBusy('download-template');
    try {
      downloadBlob(await downloadCatalogTemplate(), 'modelo-cardapio.csv');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível baixar o modelo.');
    } finally {
      setBusy(null);
    }
  }

  /** Pausar/reativar grupo de complementos — mesma ideia do "esgotado" de
   * produto: some pro cliente escolher, mas não apaga (histórico de pedido
   * intacto). Também acessível na aba Complementos. */
  async function toggleGroupActive(group: ModifierGroup) {
    setBusy(`group-active:${group.id}`);
    try {
      const updated = await setModifierGroupActive(group, !group.active);
      setGroups((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar o grupo.');
    } finally {
      setBusy(null);
    }
  }

  /** Reuso (exceção MVP 2026-08-28, fase 2/4): vincula um grupo já existente
   * de OUTRO produto a este, sem recriar do zero (mesmo "Sabores possíveis"
   * de uma pizza servindo várias pizzas, por exemplo). */
  async function linkExistingGroup() {
    if (!selectedProductId || !linkGroupId) return;
    setBusy('link-group');
    try {
      await linkModifierGroupToProduct(linkGroupId, selectedProductId);
      setGroups(await fetchModifierGroups(selectedProductId));
      setAllGroups((prev) =>
        prev.map((g) =>
          g.id === linkGroupId && !g.productIds.includes(selectedProductId)
            ? { ...g, productIds: [...g.productIds, selectedProductId] }
            : g,
        ),
      );
      setLinkGroupId('');
      setMessage('Grupo vinculado.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível vincular o grupo.');
    } finally {
      setBusy(null);
    }
  }

  async function unlinkExistingGroup(group: ModifierGroup) {
    if (!selectedProductId) return;
    setBusy(`unlink-group:${group.id}`);
    try {
      await unlinkModifierGroupFromProduct(group.id, selectedProductId);
      setGroups((prev) => prev.filter((item) => item.id !== group.id));
      setAllGroups((prev) =>
        prev.map((g) =>
          g.id === group.id
            ? { ...g, productIds: g.productIds.filter((id) => id !== selectedProductId) }
            : g,
        ),
      );
      setMessage('Grupo desvinculado deste item.');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível desvincular o grupo.');
    } finally {
      setBusy(null);
    }
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
        pdvCode: groupDraft.pdvCode.trim() || null,
      });
      setGroups((prev) => [...prev, created]);
      setModifierDraft((prev) => ({ ...prev, [created.id]: { name: '', price: '' } }));
      setGroupDraft({ name: '', min: '0', max: '1', pdvCode: '' });
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
      const created = await createModifier({
        groupId,
        name: draft.name.trim(),
        priceDeltaCents: brlToCents(draft.price),
      });
      setModifiers((prev) => ({ ...prev, [groupId]: [...(prev[groupId] ?? []), created] }));
      setModifierDraft((prev) => ({ ...prev, [groupId]: { name: '', price: '' } }));
      setMessage('Variação/adicional criado.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível criar variação/adicional.',
      );
    } finally {
      setBusy(null);
    }
  }

  async function applyPizzaTemplate() {
    if (!selectedProductId) return;
    setBusy('pizza-template');
    setCatalogMessage(null);
    try {
      const tamanho = await createModifierGroup({
        productId: selectedProductId,
        name: 'Tamanho',
        min: 1,
        max: 1,
      });
      const sabores = await createModifierGroup({
        productId: selectedProductId,
        name: 'Sabores possíveis',
        min: 1,
        max: 2,
      });
      const adicionais = await createModifierGroup({
        productId: selectedProductId,
        name: 'Adicionais e remoções',
        min: 0,
        max: 8,
      });
      const defaults = await Promise.all([
        createModifier({
          groupId: tamanho.id,
          name: 'Pequena - 4 pedaços / 1 sabor',
          priceDeltaCents: 0,
        }),
        createModifier({
          groupId: tamanho.id,
          name: 'Média - 6 pedaços / até 2 sabores',
          priceDeltaCents: 1000,
        }),
        createModifier({
          groupId: tamanho.id,
          name: 'Grande - 8 pedaços / até 2 sabores',
          priceDeltaCents: 1800,
        }),
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
      setCatalogMessage(
        'Estrutura de pizza criada. Adicione os sabores no grupo "Sabores possíveis" e ajuste os valores incrementais por tamanho ou sabor.',
      );
      setMessage('Modelo de pizza aplicado.');
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : 'Não foi possível criar o modelo de pizza.',
      );
    } finally {
      setBusy(null);
    }
  }

  const createDetailsValid = Boolean(productDraft.categoryId && productDraft.name.trim());
  const createSaleValid = isMoneyDraftValid(productDraft.price);
  const editDetailsValid = Boolean(editDraft.categoryId && editDraft.name.trim());
  const editSaleValid = isMoneyDraftValid(editDraft.price);

  return (
    <main className="min-h-screen bg-bg p-4 text-text md:p-6 xl:p-8">
      <div className="mx-auto max-w-[1600px] space-y-5">
        <header className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight">Cardápio</h1>
            <p className="mt-1 max-w-2xl text-sm text-text-muted">
              Organize o que está à venda, ajuste preços e pause um item sem perder tempo.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-border bg-bg-card px-4 text-sm font-semibold transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
              disabled={busy === 'download-template'}
              onClick={() => void downloadTemplate()}
            >
              <Download className="h-4 w-4" aria-hidden="true" />
              Baixar modelo
            </button>
            <Link
              href="/gestor/cardapio/importar"
              className="inline-flex h-11 items-center gap-2 rounded-[14px] border border-border bg-bg-card px-4 text-sm font-semibold transition-colors hover:border-brand hover:text-brand focus-visible:outline-none focus-visible:shadow-focus"
            >
              <FileSpreadsheet className="h-4 w-4" aria-hidden="true" />
              Importar cardápio
            </Link>
            <MoButton
              type="button"
              onClick={openProductCreation}
              disabled={categories.length === 0}
            >
              <Plus className="h-4 w-4" aria-hidden="true" />
              Novo item
            </MoButton>
          </div>
        </header>

        {(error || message) && !creatingProduct && !selectedProductId && (
          <div
            role={error ? 'alert' : 'status'}
            className={`rounded-[14px] border p-4 text-sm ${error ? 'border-critical bg-bg-card text-critical' : 'border-positive bg-bg-card text-positive'}`}
          >
            {error ?? message}
          </div>
        )}

        <section className="overflow-hidden rounded-[20px] border border-border bg-bg-card">
          <div className="grid grid-cols-3 divide-x divide-border border-b border-border px-4 py-3 md:w-fit md:min-w-[520px] md:px-0">
            <div className="px-3 md:px-6">
              <p className="tabular-nums text-xl font-semibold">{products.length}</p>
              <p className="text-xs text-text-muted">itens</p>
            </div>
            <div className="px-3 md:px-6">
              <p className="tabular-nums text-xl font-semibold text-positive">
                {productCounts.available}
              </p>
              <p className="text-xs text-text-muted">à venda</p>
            </div>
            <div className="px-3 md:px-6">
              <p className="tabular-nums text-xl font-semibold text-text-muted">
                {productCounts.unavailable}
              </p>
              <p className="text-xs text-text-muted">esgotados</p>
            </div>
          </div>

          <div className="relative grid min-h-[680px] lg:grid-cols-[220px_minmax(0,1fr)] xl:grid-cols-[220px_minmax(420px,1fr)_420px] 2xl:grid-cols-[220px_minmax(480px,1fr)_520px]">
            <aside className="min-w-0 border-b border-border p-4 lg:border-b-0 lg:border-r">
              <div className="flex items-center justify-between gap-3">
                <h2 className="font-semibold">Categorias</h2>
                <span className="tabular-nums text-xs text-text-muted">{categories.length}</span>
              </div>
              <div className="-mx-1 mt-3 flex gap-2 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
                <button
                  type="button"
                  aria-pressed={activeCategoryId === 'all'}
                  className={cn(
                    'flex h-11 shrink-0 items-center justify-between gap-5 rounded-[14px] px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus lg:w-full',
                    activeCategoryId === 'all' ? 'bg-brand-faint text-brand-strong' : 'hover:bg-bg',
                  )}
                  onClick={() => setActiveCategoryId('all')}
                >
                  Todas
                  <span className="tabular-nums text-xs font-normal">{products.length}</span>
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    aria-pressed={activeCategoryId === category.id}
                    className={cn(
                      'flex h-11 shrink-0 items-center justify-between gap-5 rounded-[14px] px-3 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus lg:w-full',
                      activeCategoryId === category.id
                        ? 'bg-brand-faint text-brand-strong'
                        : 'hover:bg-bg',
                    )}
                    onClick={() => setActiveCategoryId(category.id)}
                  >
                    <span className="max-w-36 truncate">{category.name}</span>
                    <span className="tabular-nums text-xs font-normal">
                      {productCounts.byCategory.get(category.id) ?? 0}
                    </span>
                  </button>
                ))}
              </div>
              <div className="mt-4 border-t border-border pt-4">
                <label
                  className="text-xs font-semibold text-text-muted"
                  htmlFor="new-category-name"
                >
                  Nova categoria
                </label>
                <div className="mt-2 flex gap-2">
                  <input
                    id="new-category-name"
                    className={cn(FIELD_CLASS, 'h-11 min-w-0 flex-1 !w-auto')}
                    value={categoryName}
                    onChange={(event) => setCategoryName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void addCategory();
                    }}
                    placeholder="Ex.: Pizzas"
                  />
                  <button
                    type="button"
                    aria-label="Adicionar categoria"
                    className={ICON_BUTTON_CLASS}
                    disabled={!categoryName.trim() || busy === 'category'}
                    onClick={() => void addCategory()}
                  >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>

              {creatingProduct && (
                <InspectorPanel
                  wide={wideInspector}
                  label="Cadastrar novo item"
                  panelRef={inspectorRef}
                  onClose={closeProductInspector}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h2 className="text-xl font-semibold">Novo item</h2>
                      <p className="mt-1 text-sm text-text-muted">
                        Etapa {productFormStep + 1} de 3 · termine no seu ritmo.
                      </p>
                    </div>
                    <button
                      type="button"
                      aria-label="Fechar cadastro do item"
                      className={ICON_BUTTON_CLASS}
                      onClick={closeProductInspector}
                    >
                      <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <InspectorFeedback error={error} message={message} />
                  <ProductFormProgress
                    current={productFormStep}
                    detailsValid={createDetailsValid}
                    saleValid={createSaleValid}
                    onChange={setProductFormStep}
                  />

                  {productFormStep === 0 && (
                    <div className="mt-7 grid gap-4">
                      <div>
                        <h3 className="font-semibold">Conte o básico</h3>
                        <p className="mt-1 text-sm text-text-muted">
                          É assim que o item vai aparecer no cardápio.
                        </p>
                      </div>
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Categoria
                        <select
                          aria-label="Categoria do produto"
                          className={cn(FIELD_CLASS, 'h-12')}
                          value={productDraft.categoryId}
                          onChange={(event) =>
                            setProductDraft((prev) => ({ ...prev, categoryId: event.target.value }))
                          }
                        >
                          <option value="">Escolha uma categoria</option>
                          {categories.map((category) => (
                            <option key={category.id} value={category.id}>
                              {category.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Nome do item
                        <input
                          aria-label="Nome do produto"
                          className={cn(FIELD_CLASS, 'h-12')}
                          maxLength={120}
                          value={productDraft.name}
                          onChange={(event) =>
                            setProductDraft((prev) => ({ ...prev, name: event.target.value }))
                          }
                          placeholder="Ex.: Xis coração"
                        />
                      </label>
                      <ProductKindPicker
                        value={productDraft.kind}
                        onChange={(kind) => setProductDraft((prev) => ({ ...prev, kind }))}
                      />
                      <label className="grid gap-1.5 text-sm font-semibold">
                        <span className="flex items-center justify-between gap-3">
                          <span>
                            Descrição{' '}
                            <span className="font-normal text-text-muted">(opcional)</span>
                          </span>
                          <span className="tabular-nums font-normal text-text-muted">
                            {productDraft.description.length}/500
                          </span>
                        </span>
                        <textarea
                          aria-label="Descrição do produto"
                          className={cn(FIELD_CLASS, 'min-h-28 py-3')}
                          maxLength={500}
                          value={productDraft.description}
                          onChange={(event) =>
                            setProductDraft((prev) => ({
                              ...prev,
                              description: event.target.value,
                            }))
                          }
                          placeholder="Conte o que vem no prato"
                        />
                      </label>
                      {!createDetailsValid && (
                        <p className="text-sm text-text-muted">
                          Escolha a categoria e dê um nome ao item para continuar.
                        </p>
                      )}
                      <MoButton
                        type="button"
                        className="w-full"
                        disabled={!createDetailsValid}
                        onClick={() => setProductFormStep(1)}
                      >
                        Continuar
                        <ChevronRight className="h-4 w-4" aria-hidden="true" />
                      </MoButton>
                    </div>
                  )}

                  {productFormStep === 1 && (
                    <div className="mt-7 grid gap-4">
                      <div>
                        <h3 className="font-semibold">Defina como vender</h3>
                        <p className="mt-1 text-sm text-text-muted">
                          O preço é obrigatório. O código do PDV ajuda na operação.
                        </p>
                      </div>
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Preço
                        <MoneyInput
                          label="Preço do produto"
                          value={productDraft.price}
                          onChange={(value) =>
                            setProductDraft((prev) => ({ ...prev, price: value }))
                          }
                          placeholder="29,90"
                        />
                      </label>
                      <label className="grid gap-1.5 text-sm font-semibold">
                        Código no PDV{' '}
                        <span className="font-normal text-text-muted">(opcional)</span>
                        <input
                          aria-label="Código no PDV"
                          className={cn(FIELD_CLASS, 'h-12')}
                          maxLength={60}
                          value={productDraft.pdvCode}
                          onChange={(event) =>
                            setProductDraft((prev) => ({ ...prev, pdvCode: event.target.value }))
                          }
                          placeholder="Ex.: 1042"
                        />
                      </label>
                      {!createSaleValid && (
                        <p className="text-sm text-text-muted">
                          Informe o preço para seguir. Valor zero também é aceito.
                        </p>
                      )}
                      <ProductStepActions
                        onBack={() => setProductFormStep(0)}
                        onNext={() => setProductFormStep(2)}
                        nextDisabled={!createSaleValid}
                      />
                    </div>
                  )}

                  {productFormStep === 2 && (
                    <div className="mt-7 grid gap-5">
                      <div>
                        <h3 className="font-semibold">Revise antes de publicar</h3>
                        <p className="mt-1 text-sm text-text-muted">
                          A foto é opcional e pode ser trocada depois.
                        </p>
                      </div>
                      <ProductDraftReview
                        category={
                          categoryById.get(productDraft.categoryId)?.name ?? 'Sem categoria'
                        }
                        name={productDraft.name}
                        price={centsToBRL(brlToCents(productDraft.price))}
                        pdvCode={productDraft.pdvCode}
                        kind={productDraft.kind}
                      />
                      <div className="grid gap-1.5 text-sm font-semibold">
                        <p>
                          Foto <span className="font-normal text-text-muted">(opcional)</span>
                        </p>
                        <PhotoPicker
                          id="new-product-photo"
                          ariaLabel="Foto do produto"
                          buttonLabel="Escolher foto"
                          file={productDraft.photo}
                          onChange={(photo) => setProductDraft((prev) => ({ ...prev, photo }))}
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-focus"
                          onClick={() => setProductFormStep(1)}
                        >
                          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                          Voltar
                        </button>
                        <MoButton
                          type="button"
                          className="flex-1"
                          disabled={busy === 'product'}
                          onClick={() => void addProduct()}
                        >
                          {busy === 'product' ? 'Publicando…' : 'Adicionar ao cardápio'}
                        </MoButton>
                      </div>
                    </div>
                  )}
                </InspectorPanel>
              )}
            </aside>
            <section className="min-w-0 p-4 lg:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h2 className="font-semibold">Itens do cardápio</h2>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {produtosFiltrados.length} de {products.length} itens aparecendo
                  </p>
                </div>
                <div className="flex gap-2" role="group" aria-label="Filtrar por status de venda">
                  <MoChip selected={salesFilter === 'all'} onClick={() => setSalesFilter('all')}>
                    Todos
                  </MoChip>
                  <MoChip
                    selected={salesFilter === 'available'}
                    onClick={() => setSalesFilter('available')}
                  >
                    À venda
                  </MoChip>
                  <MoChip
                    selected={salesFilter === 'unavailable'}
                    onClick={() => setSalesFilter('unavailable')}
                  >
                    Esgotados
                  </MoChip>
                </div>
              </div>
              <div className="mt-4 flex items-center gap-2 rounded-[14px] border border-border bg-bg-card px-3 focus-within:border-brand focus-within:shadow-focus">
                <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                <input
                  className="h-11 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
                  value={busca}
                  onChange={(event) => setBusca(event.target.value)}
                  placeholder="Buscar por nome, descrição ou código do PDV"
                  aria-label="Buscar item"
                />
                {busca && (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    className="rounded-[10px] p-1 text-text-muted hover:text-text focus-visible:outline-none focus-visible:shadow-focus"
                    onClick={() => setBusca('')}
                  >
                    <X className="h-4 w-4" aria-hidden="true" />
                  </button>
                )}
              </div>
              {catalogMessage && (
                <p
                  role="status"
                  className="mt-3 rounded-[14px] border border-positive bg-bg-card px-4 py-3 text-sm font-semibold text-positive"
                >
                  {catalogMessage}
                </p>
              )}
              <div className="mt-3 grid gap-2">
                {loadingProducts && (
                  <div className="space-y-2" aria-label="Carregando itens do cardápio">
                    {Array.from({ length: 4 }, (_, index) => (
                      <div
                        key={index}
                        className="flex items-center gap-3 rounded-[14px] border border-border p-3"
                      >
                        <MoSkeleton
                          className="h-14 w-14 shrink-0"
                          rounded="lg"
                          label={index === 0 ? 'Carregando itens do cardápio' : undefined}
                        />
                        <div className="flex-1 space-y-2">
                          <MoSkeleton className="h-4 w-2/5" rounded="pill" />
                          <MoSkeleton className="h-3 w-3/5" rounded="pill" />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {!loadingProducts && products.length === 0 && (
                  <MoEmptyState
                    className="py-10"
                    title="Nenhum prato por aqui ainda"
                    description="Cadastre o campeão de vendas primeiro. O restante do cardápio fica mais fácil depois."
                    action={{ label: 'Cadastrar primeiro item', onClick: openProductCreation }}
                  />
                )}
                {!loadingProducts && products.length > 0 && produtosFiltrados.length === 0 && (
                  <div className="flex flex-col items-center py-12 text-center">
                    <PackageOpen className="h-10 w-10 text-text-muted" aria-hidden="true" />
                    <p className="mt-3 font-semibold">Nada por aqui com esses filtros</p>
                    <p className="mt-1 max-w-xs text-sm text-text-muted">
                      Tente outra categoria, status ou termo de busca.
                    </p>
                    <button
                      type="button"
                      className="mt-4 text-sm font-semibold text-brand-strong focus-visible:outline-none focus-visible:shadow-focus"
                      onClick={() => {
                        setActiveCategoryId('all');
                        setSalesFilter('all');
                        setBusca('');
                      }}
                    >
                      Limpar filtros
                    </button>
                  </div>
                )}
                {!loadingProducts &&
                  produtosFiltrados.map((product) => {
                    const expanded =
                      selectedProductId === product.id && selectedProduct?.id === product.id;
                    return (
                      <article
                        key={product.id}
                        data-product-id={product.id}
                        className={cn(
                          'rounded-[14px] border bg-bg-card transition-colors',
                          expanded ? 'border-brand' : 'border-border hover:border-brand/50',
                        )}
                      >
                        <div className="flex flex-col items-stretch gap-3 p-3 sm:flex-row sm:items-center">
                          <button
                            type="button"
                            aria-label={`Editar ${product.name}`}
                            className="flex min-w-0 flex-1 items-center gap-3 rounded-[10px] text-left focus-visible:outline-none focus-visible:shadow-focus"
                            onClick={() => selectProductForEditing(product.id)}
                          >
                            <span
                              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[14px] bg-bg text-text-muted"
                              aria-hidden="true"
                            >
                              <UtensilsCrossed className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate font-semibold">{product.name}</span>
                              <span className="mt-0.5 block truncate text-xs text-text-muted">
                                {categoryById.get(product.categoryId)?.name ?? 'Sem categoria'}
                                {product.pdvCode ? ` · PDV ${product.pdvCode}` : ''}
                              </span>
                              {product.description && (
                                <span className="mt-1 block truncate text-xs text-text-muted">
                                  {product.description}
                                </span>
                              )}
                            </span>
                          </button>
                          <div className="flex shrink-0 flex-row items-center justify-between gap-2 sm:justify-start">
                            <span className="tabular-nums text-sm font-semibold">
                              {centsToBRL(product.basePriceCents)}
                            </span>
                            {/* Toggle direto na linha (padrão iFood: "status de
                                venda" sem abrir o item) — a versão que exigia
                                expandir pra pausar um item era lenta demais
                                pro dia a dia (sextinha lotada, item acabou). */}
                            <button
                              type="button"
                              aria-label={`${product.available ? 'Marcar como esgotado' : 'Colocar à venda'}: ${product.name}`}
                              aria-pressed={product.available}
                              disabled={busy === `availability:${product.id}`}
                              onClick={() => void toggleAvailability(product)}
                              className="rounded-pill focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
                            >
                              <MoBadge variant={product.available ? 'positive' : 'neutral'}>
                                {product.available ? 'À venda' : 'Esgotado'}
                              </MoBadge>
                            </button>
                            <div className="flex gap-1">
                              <button
                                type="button"
                                aria-label={`Editar ${product.name}`}
                                className={ICON_BUTTON_CLASS}
                                onClick={() => selectProductForEditing(product.id)}
                              >
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                              </button>
                              <button
                                type="button"
                                aria-label={`Remover ${product.name}`}
                                className={cn(
                                  ICON_BUTTON_CLASS,
                                  'hover:border-critical hover:text-critical',
                                )}
                                onClick={() => void removeProduct(product)}
                              >
                                <Trash2 className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                          </div>
                        </div>
                        {expanded && (
                          <InspectorPanel
                            wide={wideInspector}
                            label={`Editar ${selectedProduct.name}`}
                            panelRef={inspectorRef}
                            onClose={closeProductInspector}
                          >
                            <div className="flex items-start justify-between gap-4">
                              <div className="min-w-0">
                                <h2 className="truncate text-xl font-semibold">
                                  {selectedProduct.name}
                                </h2>
                                <p className="mt-1 text-sm text-text-muted">
                                  Etapa {productFormStep + 1} de 3 · altere só o que precisar.
                                </p>
                              </div>
                              <button
                                type="button"
                                aria-label="Fechar edição do item"
                                className={ICON_BUTTON_CLASS}
                                onClick={closeProductInspector}
                              >
                                <X className="h-4 w-4" aria-hidden="true" />
                              </button>
                            </div>
                            <InspectorFeedback error={error} message={message} />
                            <ProductFormProgress
                              current={productFormStep}
                              detailsValid={editDetailsValid}
                              saleValid={editSaleValid}
                              onChange={setProductFormStep}
                            />

                            {productFormStep === 0 && (
                              <div className="mt-7 grid gap-4">
                                <div>
                                  <h3 className="font-semibold">Informações do item</h3>
                                  <p className="mt-1 text-sm text-text-muted">
                                    Ajuste o nome, a categoria e a descrição pública.
                                  </p>
                                </div>
                                <label className="grid gap-1.5 text-sm font-semibold">
                                  Categoria
                                  <select
                                    aria-label="Categoria do item"
                                    className={cn(FIELD_CLASS, 'h-12')}
                                    value={editDraft.categoryId}
                                    onChange={(event) =>
                                      setEditDraft((prev) => ({
                                        ...prev,
                                        categoryId: event.target.value,
                                      }))
                                    }
                                  >
                                    {categories.map((category) => (
                                      <option key={category.id} value={category.id}>
                                        {category.name}
                                      </option>
                                    ))}
                                  </select>
                                </label>
                                <label className="grid gap-1.5 text-sm font-semibold">
                                  Nome do item
                                  <input
                                    aria-label="Nome do item"
                                    className={cn(FIELD_CLASS, 'h-12')}
                                    maxLength={120}
                                    value={editDraft.name}
                                    onChange={(event) =>
                                      setEditDraft((prev) => ({
                                        ...prev,
                                        name: event.target.value,
                                      }))
                                    }
                                    placeholder="Nome do item"
                                  />
                                </label>
                                {selectedProduct.kind === 'combo' ? (
                                  <p className="text-sm text-text-muted">
                                    Tipo do item: Combo. A edição de combo entra numa próxima
                                    atualização.
                                  </p>
                                ) : (
                                  <ProductKindPicker
                                    value={editDraft.kind}
                                    onChange={(kind) =>
                                      setEditDraft((prev) => ({ ...prev, kind }))
                                    }
                                  />
                                )}
                                <label className="grid gap-1.5 text-sm font-semibold">
                                  <span className="flex items-center justify-between gap-3">
                                    <span>
                                      Descrição{' '}
                                      <span className="font-normal text-text-muted">
                                        (opcional)
                                      </span>
                                    </span>
                                    <span className="tabular-nums font-normal text-text-muted">
                                      {editDraft.description.length}/500
                                    </span>
                                  </span>
                                  <textarea
                                    aria-label="Descrição do item"
                                    className={cn(FIELD_CLASS, 'min-h-28 py-3')}
                                    maxLength={500}
                                    value={editDraft.description}
                                    onChange={(event) =>
                                      setEditDraft((prev) => ({
                                        ...prev,
                                        description: event.target.value,
                                      }))
                                    }
                                    placeholder="Conte o que vem no prato"
                                  />
                                </label>
                                {!editDetailsValid && (
                                  <p className="text-sm text-text-muted">
                                    Categoria e nome precisam estar preenchidos.
                                  </p>
                                )}
                                <MoButton
                                  type="button"
                                  className="w-full"
                                  disabled={!editDetailsValid}
                                  onClick={() => setProductFormStep(1)}
                                >
                                  Continuar
                                  <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </MoButton>
                              </div>
                            )}

                            {productFormStep === 1 && (
                              <div className="mt-7 grid gap-4">
                                <div>
                                  <h3 className="font-semibold">Venda e operação</h3>
                                  <p className="mt-1 text-sm text-text-muted">
                                    Atualize o preço e o código usado no seu PDV.
                                  </p>
                                </div>
                                <label className="grid gap-1.5 text-sm font-semibold">
                                  Preço
                                  <MoneyInput
                                    label="Preço do item"
                                    value={editDraft.price}
                                    onChange={(value) =>
                                      setEditDraft((prev) => ({ ...prev, price: value }))
                                    }
                                    placeholder="29,90"
                                  />
                                </label>
                                <label className="grid gap-1.5 text-sm font-semibold">
                                  Código no PDV{' '}
                                  <span className="font-normal text-text-muted">(opcional)</span>
                                  <input
                                    aria-label="Código no PDV"
                                    className={cn(FIELD_CLASS, 'h-12')}
                                    maxLength={60}
                                    value={editDraft.pdvCode}
                                    onChange={(event) =>
                                      setEditDraft((prev) => ({
                                        ...prev,
                                        pdvCode: event.target.value,
                                      }))
                                    }
                                    placeholder="Ex.: 1042"
                                  />
                                </label>
                                <ProductOffersEditor
                                  product={selectedProduct}
                                  categories={categories}
                                  primaryDraft={{
                                    categoryId: editDraft.categoryId,
                                    price: editDraft.price,
                                    pdvCode: editDraft.pdvCode,
                                  }}
                                />
                                {!editSaleValid && (
                                  <p className="text-sm text-text-muted">
                                    Informe o preço para seguir. Valor zero também é aceito.
                                  </p>
                                )}
                                <ProductStepActions
                                  onBack={() => setProductFormStep(0)}
                                  onNext={() => setProductFormStep(2)}
                                  nextDisabled={!editSaleValid}
                                />
                              </div>
                            )}

                            {productFormStep === 2 && (
                              <>
                                <div className="mt-7 grid gap-4">
                                  <div>
                                    <h3 className="font-semibold">Revise as alterações</h3>
                                    <p className="mt-1 text-sm text-text-muted">
                                      Salve os dados antes de sair. Fotos continuam sendo enviadas
                                      separadamente.
                                    </p>
                                  </div>
                                  <ProductDraftReview
                                    category={
                                      categoryById.get(editDraft.categoryId)?.name ??
                                      'Sem categoria'
                                    }
                                    name={editDraft.name}
                                    price={centsToBRL(brlToCents(editDraft.price))}
                                    pdvCode={editDraft.pdvCode}
                                    kind={editDraft.kind}
                                  />
                                  <div className="flex gap-2">
                                    <button
                                      type="button"
                                      className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-focus"
                                      onClick={() => setProductFormStep(1)}
                                    >
                                      <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                      Voltar
                                    </button>
                                    <MoButton
                                      type="button"
                                      className="flex-1"
                                      disabled={busy === 'product-edit'}
                                      onClick={() => void saveSelectedProduct()}
                                    >
                                      {busy === 'product-edit' ? 'Salvando…' : 'Salvar alterações'}
                                    </MoButton>
                                  </div>
                                </div>

                                <div className="mt-8 border-t border-border pt-6">
                                  <p className="text-sm font-semibold">Fotos do item</p>
                                  <p className="text-xs text-text-muted">
                                    A primeira foto é a capa que aparece no cardápio.
                                  </p>
                                  <div className="mt-2 flex flex-wrap gap-3">
                                    {[...images]
                                      .sort((a, b) => a.position - b.position)
                                      .map((image, index) => (
                                        <div key={image.id} className="w-24">
                                          <div className="relative h-24 w-24 overflow-hidden rounded-[14px] border border-border bg-bg">
                                            {image.imageUrl ? (
                                              <img
                                                src={image.imageUrl}
                                                alt={`Foto de ${selectedProduct.name}`}
                                                width={96}
                                                height={96}
                                                className="h-full w-full object-cover"
                                              />
                                            ) : (
                                              <div className="flex h-full items-center justify-center px-2 text-center text-xs text-text-muted">
                                                Foto salva
                                              </div>
                                            )}
                                            {index === 0 && (
                                              <span className="absolute left-1 top-1 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand">
                                                Capa
                                              </span>
                                            )}
                                          </div>
                                          <div className="mt-1 flex items-center justify-center gap-1">
                                            <button
                                              type="button"
                                              aria-label="Mover pra cima"
                                              disabled={
                                                index === 0 || busy === 'product-photo-reorder'
                                              }
                                              className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-border disabled:opacity-30"
                                              onClick={() => void moveImage(image, 'up')}
                                            >
                                              <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                            <button
                                              type="button"
                                              aria-label="Mover pra baixo"
                                              disabled={
                                                index === images.length - 1 ||
                                                busy === 'product-photo-reorder'
                                              }
                                              className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-border disabled:opacity-30"
                                              onClick={() => void moveImage(image, 'down')}
                                            >
                                              <ArrowDown
                                                className="h-3.5 w-3.5"
                                                aria-hidden="true"
                                              />
                                            </button>
                                            <button
                                              type="button"
                                              aria-label="Remover foto"
                                              disabled={busy === 'product-photo-delete'}
                                              className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-critical text-critical disabled:opacity-30"
                                              onClick={() => void removeImage(image)}
                                            >
                                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                                            </button>
                                          </div>
                                        </div>
                                      ))}
                                    {images.length === 0 && (
                                      <div className="flex h-24 min-w-44 items-center rounded-[14px] border border-dashed border-border px-3 text-sm text-text-muted">
                                        Nenhuma foto cadastrada.
                                      </div>
                                    )}
                                  </div>
                                  <div className="mt-3 grid gap-2">
                                    <PhotoPicker
                                      id="edit-product-photo"
                                      ariaLabel="Adicionar foto do item"
                                      buttonLabel="Escolher nova foto"
                                      file={editPhoto}
                                      onChange={setEditPhoto}
                                    />
                                    <button
                                      className="h-11 rounded-[14px] border border-border px-4 font-semibold focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50"
                                      disabled={!editPhoto || busy === 'product-photo'}
                                      onClick={() => void uploadSelectedProductPhoto()}
                                    >
                                      {busy === 'product-photo' ? 'Enviando…' : 'Adicionar foto'}
                                    </button>
                                  </div>
                                </div>
                                <div className="mt-5">
                                  <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
                                    <div>
                                      <p className="font-semibold">
                                        Variações, adicionais e remoções
                                      </p>
                                      <p className="text-sm text-text-muted">
                                        Use grupos para tamanho, sabores, extras pagos ou opções sem
                                        custo como “sem salada”. Total exemplo:{' '}
                                        {centsToBRL(manualTotalCents)}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      className="w-full shrink-0 rounded-[14px] border border-border px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-focus disabled:opacity-50 sm:w-auto"
                                      disabled={busy === 'pizza-template'}
                                      onClick={() => void applyPizzaTemplate()}
                                    >
                                      Montar como pizza
                                    </button>
                                  </div>
                                  {/* Reuso (exceção MVP 2026-08-28, fase 2/4): vincular um
                                  grupo que já existe em OUTRO produto, sem recriar
                                  ("Sabores possíveis" de uma pizza servindo várias). */}
                                  {allGroups.some(
                                    (g) => !g.productIds.includes(selectedProductId),
                                  ) && (
                                    <div className="mt-3 flex gap-2">
                                      <select
                                        aria-label="Vincular grupo existente"
                                        className="h-12 flex-1 rounded-[14px] border border-border bg-bg-card px-3"
                                        value={linkGroupId}
                                        onChange={(event) => setLinkGroupId(event.target.value)}
                                      >
                                        <option value="">Vincular grupo existente…</option>
                                        {allGroups
                                          .filter((g) => !g.productIds.includes(selectedProductId))
                                          .map((g) => (
                                            <option key={g.id} value={g.id}>
                                              {g.name} ({g.productNames.join(', ')})
                                            </option>
                                          ))}
                                      </select>
                                      <button
                                        className="rounded-[14px] border border-border px-4 font-semibold disabled:opacity-50"
                                        disabled={!linkGroupId || busy === 'link-group'}
                                        onClick={() => void linkExistingGroup()}
                                      >
                                        Vincular
                                      </button>
                                    </div>
                                  )}
                                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                    <input
                                      aria-label="Nome do grupo"
                                      className={cn(FIELD_CLASS, 'h-12 sm:col-span-2')}
                                      value={groupDraft.name}
                                      onChange={(event) =>
                                        setGroupDraft((prev) => ({
                                          ...prev,
                                          name: event.target.value,
                                        }))
                                      }
                                      placeholder="Tamanho ou adicionais"
                                    />
                                    <input
                                      aria-label="Mínimo de opções do grupo"
                                      className={cn(FIELD_CLASS, 'h-12')}
                                      value={groupDraft.min}
                                      onChange={(event) =>
                                        setGroupDraft((prev) => ({
                                          ...prev,
                                          min: event.target.value,
                                        }))
                                      }
                                      placeholder="Mínimo"
                                    />
                                    <input
                                      aria-label="Máximo de opções do grupo"
                                      className={cn(FIELD_CLASS, 'h-12')}
                                      value={groupDraft.max}
                                      onChange={(event) =>
                                        setGroupDraft((prev) => ({
                                          ...prev,
                                          max: event.target.value,
                                        }))
                                      }
                                      placeholder="Máximo"
                                    />
                                    <input
                                      aria-label="Código PDV do grupo"
                                      className={cn(FIELD_CLASS, 'h-12')}
                                      value={groupDraft.pdvCode}
                                      onChange={(event) =>
                                        setGroupDraft((prev) => ({
                                          ...prev,
                                          pdvCode: event.target.value,
                                        }))
                                      }
                                      placeholder="Código PDV"
                                    />
                                    <button
                                      className="h-12 rounded-[14px] bg-brand px-4 font-semibold text-on-brand focus-visible:outline-none focus-visible:shadow-focus"
                                      onClick={() => void addGroup()}
                                    >
                                      Criar grupo
                                    </button>
                                  </div>
                                  <div className="mt-4 space-y-3">
                                    {groups.map((group) => {
                                      const reused =
                                        (allGroups.find((g) => g.id === group.id)?.productIds
                                          .length ?? 1) > 1;
                                      return (
                                        <div
                                          key={group.id}
                                          className="rounded-[14px] border border-border bg-bg-card p-4"
                                        >
                                          <div className="flex items-center justify-between gap-2">
                                            <p className="font-semibold">
                                              {group.name}{' '}
                                              <span className="text-sm font-normal text-text-muted">
                                                mín. {group.min}, máx. {group.max}
                                              </span>
                                              {reused && (
                                                <span className="ml-2 rounded-full bg-brand-faint px-1.5 py-0.5 text-xs font-semibold text-brand-strong">
                                                  reutilizado
                                                </span>
                                              )}
                                            </p>
                                            <div className="flex items-center gap-2">
                                              {/* Pausar sem apagar (aba Complementos): grupo some pro
                                            cliente escolher, histórico de pedido não quebra. */}
                                              <button
                                                type="button"
                                                disabled={busy === `group-active:${group.id}`}
                                                onClick={() => void toggleGroupActive(group)}
                                                className={`rounded-full px-2 py-0.5 text-xs font-semibold disabled:opacity-50 ${group.active ? 'bg-positive/10 text-positive' : 'bg-bg text-text-muted'}`}
                                              >
                                                {group.active ? 'ativo' : 'pausado'}
                                              </button>
                                              <button
                                                type="button"
                                                disabled={busy === `unlink-group:${group.id}`}
                                                onClick={() => void unlinkExistingGroup(group)}
                                                className="text-xs font-semibold text-text-muted hover:text-critical disabled:opacity-50"
                                              >
                                                Desvincular
                                              </button>
                                            </div>
                                          </div>
                                          <div className="mt-3 flex flex-wrap gap-2">
                                            {(modifiers[group.id] ?? []).map((item) => (
                                              <span
                                                key={item.id}
                                                className="rounded-full border border-border px-3 py-1 text-sm"
                                              >
                                                {item.name}{' '}
                                                {item.priceDeltaCents > 0
                                                  ? `+${centsToBRL(item.priceDeltaCents)}`
                                                  : 'sem custo'}
                                              </span>
                                            ))}
                                          </div>
                                          <div className="mt-3 grid gap-2 sm:grid-cols-[minmax(0,1fr)_140px]">
                                            <input
                                              aria-label="Nome do complemento"
                                              className={cn(FIELD_CLASS, 'h-11')}
                                              value={modifierDraft[group.id]?.name ?? ''}
                                              onChange={(event) =>
                                                setModifierDraft((prev) => ({
                                                  ...prev,
                                                  [group.id]: {
                                                    ...(prev[group.id] ?? { price: '' }),
                                                    name: event.target.value,
                                                  },
                                                }))
                                              }
                                              placeholder="Extra queijo / Sem salada / Calabresa"
                                            />
                                            <MoneyInput
                                              label={`Preço de ${group.name}`}
                                              value={modifierDraft[group.id]?.price ?? ''}
                                              onChange={(value) =>
                                                setModifierDraft((prev) => ({
                                                  ...prev,
                                                  [group.id]: {
                                                    ...(prev[group.id] ?? { name: '' }),
                                                    price: value,
                                                  },
                                                }))
                                              }
                                              placeholder="4,00"
                                            />
                                            <button
                                              className="h-11 rounded-[14px] border border-border font-semibold focus-visible:outline-none focus-visible:shadow-focus sm:col-span-2"
                                              onClick={() => void addModifier(group.id)}
                                            >
                                              Adicionar complemento
                                            </button>
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              </>
                            )}
                          </InspectorPanel>
                        )}
                      </article>
                    );
                  })}
              </div>
            </section>
            <aside className="hidden border-l border-border bg-bg/50 p-6 xl:flex xl:flex-col xl:items-center xl:justify-center">
              {!selectedProduct && !creatingProduct && (
                <div className="max-w-xs text-center">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-[20px] bg-brand-faint text-brand-strong">
                    <ImageIcon className="h-7 w-7" aria-hidden="true" />
                  </div>
                  <h2 className="mt-4 font-semibold">Selecione um item</h2>
                  <p className="mt-1 text-sm text-text-muted">
                    Os dados, fotos e complementos aparecem aqui sem tirar você da lista.
                  </p>
                </div>
              )}
            </aside>
          </div>
        </section>
      </div>
    </main>
  );
}

function InspectorPanel({
  wide,
  label,
  panelRef,
  onClose,
  children,
}: {
  wide: boolean;
  label: string;
  panelRef: React.RefObject<HTMLElement | null>;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const panel = panelRef.current;
    if (wide) {
      panel?.focus();
      return;
    }
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else dialog.setAttribute('open', '');
    dialog.focus();
    return () => {
      if (dialog.open && typeof dialog.close === 'function') dialog.close();
    };
  }, [panelRef, wide]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    onClose();
  };

  if (wide) {
    return (
      <div
        ref={(node) => {
          panelRef.current = node;
        }}
        role="region"
        aria-label={label}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 z-10 w-[420px] overflow-y-auto border-l border-border bg-bg-card p-6 outline-none 2xl:w-[520px]"
        onKeyDown={handleKeyDown}
      >
        {children}
      </div>
    );
  }

  return (
    <dialog
      ref={(node) => {
        dialogRef.current = node;
        panelRef.current = node;
      }}
      aria-label={label}
      aria-modal="true"
      role="dialog"
      tabIndex={-1}
      className="fixed inset-0 z-50 m-0 h-dvh max-h-none w-full max-w-none overflow-y-auto border-0 bg-bg-card p-4 text-text outline-none backdrop:bg-black/20"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      {children}
    </dialog>
  );
}

function InspectorAlert({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="mt-4 rounded-[14px] border border-critical bg-bg-card px-4 py-3 text-sm font-semibold text-critical"
    >
      {message}
    </p>
  );
}

function InspectorFeedback({ error, message }: { error: string | null; message: string | null }) {
  if (error) return <InspectorAlert message={error} />;
  if (!message) return null;
  return (
    <p
      role="status"
      className="mt-4 rounded-[14px] border border-positive bg-bg-card px-4 py-3 text-sm font-semibold text-positive"
    >
      {message}
    </p>
  );
}

function ProductFormProgress({
  current,
  detailsValid,
  saleValid,
  onChange,
}: {
  current: ProductFormStep;
  detailsValid: boolean;
  saleValid: boolean;
  onChange: (step: ProductFormStep) => void;
}) {
  return (
    <nav className="mt-6" aria-label="Etapas do item">
      <ol className="grid grid-cols-3 gap-2">
        {PRODUCT_FORM_STEPS.map((label, index) => {
          const step = index as ProductFormStep;
          const available =
            step === 0 || (step === 1 && detailsValid) || (detailsValid && saleValid);
          const complete = current > step;
          const active = current === step;
          return (
            <li key={label}>
              <button
                type="button"
                aria-current={active ? 'step' : undefined}
                disabled={!available}
                className={cn(
                  'flex min-h-16 w-full flex-col items-center justify-center gap-1 rounded-[14px] px-1.5 text-center text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus disabled:cursor-not-allowed disabled:opacity-45',
                  active
                    ? 'bg-brand-faint text-brand-strong'
                    : 'bg-bg text-text-muted hover:text-text',
                )}
                onClick={() => onChange(step)}
              >
                <span
                  className={cn(
                    'flex h-6 w-6 items-center justify-center rounded-full border text-[11px] tabular-nums',
                    active || complete
                      ? 'border-brand bg-brand text-on-brand'
                      : 'border-border bg-bg-card',
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : index + 1}
                </span>
                <span>{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function ProductStepActions({
  onBack,
  onNext,
  nextDisabled,
}: {
  onBack: () => void;
  onNext: () => void;
  nextDisabled: boolean;
}) {
  return (
    <div className="flex gap-2">
      <button
        type="button"
        className="inline-flex h-12 items-center justify-center gap-2 rounded-[14px] border border-border px-4 text-sm font-semibold focus-visible:outline-none focus-visible:shadow-focus"
        onClick={onBack}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        Voltar
      </button>
      <MoButton type="button" className="flex-1" disabled={nextDisabled} onClick={onNext}>
        Continuar
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </MoButton>
    </div>
  );
}

function ProductDraftReview({
  category,
  name,
  price,
  pdvCode,
  kind,
}: {
  category: string;
  name: string;
  price: string;
  pdvCode: string;
  kind: ProductKind;
}) {
  return (
    <dl className="divide-y divide-border border-y border-border text-sm">
      <ReviewRow label="Item" value={name} />
      <ReviewRow label="Categoria" value={category} />
      <ReviewRow label="Tipo" value={productKindLabel(kind)} />
      <ReviewRow label="Preço" value={price} tabular />
      <ReviewRow label="Código no PDV" value={pdvCode || 'Não informado'} />
    </dl>
  );
}

/** Fase 3 do combo — prato feito × industrializado. `combo` é escolhido pelo
 * fluxo de combo (fase 4), não por aqui. */
function ProductKindPicker({
  value,
  onChange,
}: {
  value: ProductKind;
  onChange: (kind: ProductKind) => void;
}) {
  return (
    <div className="grid gap-1.5 text-sm font-semibold">
      Tipo do item
      <div
        role="radiogroup"
        aria-label="Tipo do item"
        className="grid grid-cols-2 gap-2"
      >
        {CATALOG_PRODUCT_KINDS.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              'min-h-11 rounded-[14px] border px-3 py-2 text-left text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:shadow-focus',
              value === option.value
                ? 'border-brand bg-brand text-on-brand'
                : 'border-border bg-bg-card text-text',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function ReviewRow({
  label,
  value,
  tabular = false,
}: {
  label: string;
  value: string;
  tabular?: boolean;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4 py-3">
      <dt className="text-text-muted">{label}</dt>
      <dd className={cn('break-words text-right font-semibold', tabular && 'tabular-nums')}>
        {value}
      </dd>
    </div>
  );
}

function PhotoPicker({
  id,
  ariaLabel,
  buttonLabel,
  file,
  onChange,
}: {
  id: string;
  ariaLabel: string;
  buttonLabel: string;
  file: File | null;
  onChange: (file: File | null) => void;
}) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!file || typeof URL.createObjectURL !== 'function') {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    const revokeObjectUrl =
      typeof URL.revokeObjectURL === 'function' ? URL.revokeObjectURL.bind(URL) : null;
    setPreviewUrl(url);
    return () => revokeObjectUrl?.(url);
  }, [file]);

  return (
    <div className="grid gap-2 rounded-[14px] border border-border bg-bg p-3 focus-within:border-brand focus-within:shadow-focus">
      {previewUrl && file && (
        <img
          src={previewUrl}
          alt={`Prévia de ${file.name}`}
          width={480}
          height={240}
          className="h-40 w-full rounded-[14px] object-cover"
        />
      )}
      <input
        id={id}
        aria-label={ariaLabel}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => onChange(event.target.files?.[0] ?? null)}
      />
      <label
        htmlFor={id}
        className="inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[14px] bg-bg-card px-4 text-sm font-semibold text-brand-strong"
      >
        <ImageIcon className="h-4 w-4" aria-hidden="true" />
        {buttonLabel}
      </label>
      <p className="truncate text-center text-xs font-normal text-text-muted">
        {file ? file.name : 'JPG, PNG ou WEBP'}
      </p>
    </div>
  );
}

function MoneyInput({
  value,
  onChange,
  label,
  placeholder,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  label: string;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex h-12 items-center rounded-[14px] border border-border bg-bg-card px-3 focus-within:border-brand focus-within:shadow-focus ${className}`}
    >
      <span className="mr-2 text-sm font-semibold text-text-muted">R$</span>
      <input
        aria-label={label}
        className="h-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-text-muted"
        inputMode="decimal"
        value={value.replace(/^R\$\s?/, '')}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
