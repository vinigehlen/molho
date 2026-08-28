'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDown, ArrowUp, Search, Trash2 } from 'lucide-react';
import { centsToBRL } from '../../../lib/format';
import { getStaffSession } from '../../../lib/staff-session';
import {
  createCategory,
  createModifier,
  createModifierGroup,
  createProduct,
  deleteProduct,
  deleteProductImage,
  downloadCatalogTemplate,
  fetchCategories,
  fetchModifierGroups,
  fetchModifiers,
  fetchProductImages,
  fetchProducts,
  importCatalog,
  reorderProductImage,
  setProductAvailability,
  updateProduct,
  uploadProductImage,
  type Category,
  type Modifier,
  type ModifierGroup,
  type Product,
  type ProductImage,
} from '../../../lib/catalog-api';

function brlToCents(value: string): number {
  const normalized = value.replace(/[^\d,]/g, '').replace(',', '.');
  return Math.max(0, Math.round(Number(normalized || '0') * 100));
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
  const [busca, setBusca] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [catalogMessage, setCatalogMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedProduct = products.find((product) => product.id === selectedProductId) ?? null;
  const manualTotalCents = useMemo(() => {
    if (!selectedProduct) return 0;
    return selectedProduct.basePriceCents + Object.values(modifiers).flat().reduce((sum, item) => sum + item.priceDeltaCents, 0);
  }, [modifiers, selectedProduct]);

  // Busca por nome (padrão iFood na aba de complementos/produtos) — cardápio
  // com 30+ itens vira uma rolagem cega sem isso.
  const produtosFiltrados = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    if (!termo) return products;
    return products.filter((product) => product.name.toLowerCase().includes(termo));
  }, [products, busca]);

  useEffect(() => {
    if (!getStaffSession()) return;
    setBusy('load');
    setError(null);
    fetchCategories()
      .then((loaded) => {
        setCategories(loaded);
        setProductDraft((prev) => ({ ...prev, categoryId: prev.categoryId || loaded[0]?.id || '' }));
      })
      .catch((cause) => setError(cause instanceof Error ? cause.message : 'Não foi possível carregar categorias.'))
      .finally(() => setBusy(null));
  }, []);

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
      setImages((prev) => prev.map((item) => (item.id === updatedImage.id ? updatedImage : item.id === updatedOther.id ? updatedOther : item)));
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
      if (preferredProductId && flat.some((product) => product.id === preferredProductId)) return preferredProductId;
      if (current && flat.some((product) => product.id === current)) return current;
      return flat[0]?.id ?? '';
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
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar disponibilidade.');
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

  return (
    <main className="min-h-screen bg-bg p-4 text-text md:p-8">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-3xl font-semibold">Cardápio</h1>
            <p className="mt-1 text-sm text-text-muted">Comece pelo carro-chefe da casa. Depois organize variações, adicionais e fotos.</p>
          </div>
          <span className="rounded-full border border-border px-3 py-1 text-sm font-semibold">{products.length} item(ns)</span>
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
          <div className="grid gap-4 lg:grid-cols-[1fr_1.5fr]">
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
                <div className="mt-3 flex items-center gap-2 rounded-[14px] border border-border bg-bg-card px-3">
                  <Search className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
                  <input
                    className="h-11 flex-1 bg-transparent outline-none"
                    value={busca}
                    onChange={(event) => setBusca(event.target.value)}
                    placeholder="Buscar item pelo nome"
                    aria-label="Buscar item pelo nome"
                  />
                </div>
                {catalogMessage && <p role="status" className="mt-3 rounded-[14px] border border-positive bg-bg-card px-4 py-3 text-sm font-semibold text-positive">{catalogMessage}</p>}
                <div className="mt-3 grid gap-2">
                  {products.length === 0 && (
                    <div className="rounded-[14px] border border-dashed border-border bg-bg-card p-5">
                      <p className="font-semibold">Nenhum prato por aqui ainda.</p>
                      <p className="mt-1 text-sm text-text-muted">Cadastre o campeão de vendas primeiro: foto, nome direto, descrição curta e preço redondo.</p>
                    </div>
                  )}
                  {products.length > 0 && produtosFiltrados.length === 0 && (
                    <p className="text-sm text-text-muted">Nenhum item bate com &ldquo;{busca}&rdquo;.</p>
                  )}
                  {produtosFiltrados.map((product) => {
                    const expanded = selectedProductId === product.id && selectedProduct?.id === product.id;
                    return (
                      <div key={product.id} className={`rounded-[14px] border ${expanded ? 'border-brand bg-brand-faint' : 'border-border bg-bg-card'}`}>
                        <div className="flex flex-col gap-3 px-4 py-3 md:flex-row md:items-center md:justify-between">
                          <button className="flex-1 text-left" onClick={() => setSelectedProductId(expanded ? '' : product.id)}>
                            <span className="font-semibold">{product.name}</span>
                            <span className="ml-2 text-sm text-text-muted">{centsToBRL(product.basePriceCents)}</span>
                          </button>
                          <div className="flex items-center gap-2">
                            {/* Toggle direto na linha (padrão iFood: "status de
                                venda" sem abrir o item) — a versão que exigia
                                expandir pra pausar um item era lenta demais
                                pro dia a dia (sextinha lotada, item acabou). */}
                            <button
                              type="button"
                              disabled={busy === `availability:${product.id}`}
                              onClick={() => void toggleAvailability(product)}
                              className={`rounded-full px-2 py-0.5 text-xs font-semibold disabled:opacity-50 ${product.available ? 'bg-positive/10 text-positive' : 'bg-bg text-text-muted'}`}
                            >
                              {product.available ? 'ativo' : 'esgotado'}
                            </button>
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
                              <p className="text-xs text-text-muted">A primeira foto é a capa que aparece no cardápio.</p>
                              <div className="mt-2 flex flex-wrap gap-3">
                                {[...images]
                                  .sort((a, b) => a.position - b.position)
                                  .map((image, index) => (
                                    <div key={image.id} className="w-24">
                                      <div className="relative h-24 w-24 overflow-hidden rounded-[14px] border border-border bg-bg">
                                        {image.imageUrl ? (
                                          <img src={image.imageUrl} alt={`Foto de ${selectedProduct.name}`} width={96} height={96} className="h-full w-full object-cover" />
                                        ) : (
                                          <div className="flex h-full items-center justify-center px-2 text-center text-xs text-text-muted">Foto salva</div>
                                        )}
                                        {index === 0 && (
                                          <span className="absolute left-1 top-1 rounded-full bg-brand px-2 py-0.5 text-xs font-semibold text-on-brand">Capa</span>
                                        )}
                                      </div>
                                      <div className="mt-1 flex items-center justify-center gap-1">
                                        <button
                                          type="button"
                                          aria-label="Mover pra cima"
                                          disabled={index === 0 || busy === 'product-photo-reorder'}
                                          className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-border disabled:opacity-30"
                                          onClick={() => void moveImage(image, 'up')}
                                        >
                                          <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />
                                        </button>
                                        <button
                                          type="button"
                                          aria-label="Mover pra baixo"
                                          disabled={index === images.length - 1 || busy === 'product-photo-reorder'}
                                          className="flex h-7 w-7 items-center justify-center rounded-[10px] border border-border disabled:opacity-30"
                                          onClick={() => void moveImage(image, 'down')}
                                        >
                                          <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
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
      </div>
    </main>
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
