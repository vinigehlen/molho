import { apiFetch } from './api-client';
import { compressProductImage } from './image-compression';

export interface Category {
  id: string;
  name: string;
  sortOrder: number;
  visible: boolean;
  version: number;
}

export interface Product {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  basePriceCents: number;
  imageKey: string | null;
  available: boolean;
  /** Código do item no PDV do lojista — texto livre, opcional. */
  pdvCode: string | null;
  sortOrder: number;
  version: number;
}

export interface ModifierGroup {
  id: string;
  productId: string;
  name: string;
  min: number;
  max: number;
  /** Pausado = existe, some pro cliente escolher (aba Complementos). */
  active: boolean;
  pdvCode: string | null;
  version: number;
}

/** Linha da aba "Complementos" — grupo + nome do produto dono (ver
 * GET /v1/admin/modifier-groups sem `productId`). */
export interface ModifierGroupWithProduct extends ModifierGroup {
  productName: string;
}

export interface Modifier {
  id: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
  version: number;
}

export interface ProductImage {
  id: string;
  productId: string;
  imageKey: string;
  imageUrl?: string | null;
  position: number;
  version: number;
}

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiFetch('/v1/admin/categories');
  if (!res.ok) throw new Error(`Falha ao carregar categorias (${res.status})`);
  return (await res.json()) as Category[];
}

export async function createCategory(input: { name: string; sortOrder?: number }): Promise<Category> {
  const res = await apiFetch('/v1/admin/categories', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao criar categoria (${res.status})`);
  return (await res.json()) as Category;
}

export async function fetchProducts(categoryId: string): Promise<Product[]> {
  const res = await apiFetch(`/v1/admin/products?categoryId=${encodeURIComponent(categoryId)}`);
  if (!res.ok) throw new Error(`Falha ao carregar produtos (${res.status})`);
  return (await res.json()) as Product[];
}

export async function createProduct(input: {
  categoryId: string;
  name: string;
  description?: string;
  basePriceCents: number;
  pdvCode?: string | null;
  sortOrder?: number;
}): Promise<Product> {
  const res = await apiFetch('/v1/admin/products', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao criar produto (${res.status})`);
  return (await res.json()) as Product;
}

export async function updateProduct(
  product: Product,
  input: Partial<Pick<Product, 'categoryId' | 'name' | 'description' | 'basePriceCents' | 'pdvCode' | 'sortOrder'>>,
): Promise<Product> {
  const res = await apiFetch(`/v1/admin/products/${encodeURIComponent(product.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: product.version, ...input }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar produto (${res.status})`);
  return (await res.json()) as Product;
}

export async function deleteProduct(product: Product): Promise<void> {
  const res = await apiFetch(`/v1/admin/products/${encodeURIComponent(product.id)}?version=${encodeURIComponent(product.version)}`, {
    method: 'DELETE',
  });
  if (!res.ok) throw new Error(`Falha ao remover produto (${res.status})`);
}

export async function setProductAvailability(product: Product, available: boolean): Promise<Product> {
  const res = await apiFetch(`/v1/admin/products/${encodeURIComponent(product.id)}/availability`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: product.version, available }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar disponibilidade (${res.status})`);
  return (await res.json()) as Product;
}

export async function fetchModifierGroups(productId: string): Promise<ModifierGroup[]> {
  const res = await apiFetch(`/v1/admin/modifier-groups?productId=${encodeURIComponent(productId)}`);
  if (!res.ok) throw new Error(`Falha ao carregar grupos de complementos (${res.status})`);
  return (await res.json()) as ModifierGroup[];
}

/** Aba "Complementos": todos os grupos do tenant, com o nome do produto dono. */
export async function fetchAllModifierGroups(): Promise<ModifierGroupWithProduct[]> {
  const res = await apiFetch('/v1/admin/modifier-groups');
  if (!res.ok) throw new Error(`Falha ao carregar complementos (${res.status})`);
  return (await res.json()) as ModifierGroupWithProduct[];
}

export async function createModifierGroup(input: { productId: string; name: string; min?: number; max?: number; pdvCode?: string | null }): Promise<ModifierGroup> {
  const res = await apiFetch('/v1/admin/modifier-groups', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao criar grupo de complementos (${res.status})`);
  return (await res.json()) as ModifierGroup;
}

/** Pausar/reativar (badge "ativo/pausado" na aba Complementos) — mesmo
 * padrão de setProductAvailability, sem endpoint dedicado: PATCH genérico
 * com só o campo `active`. */
export async function setModifierGroupActive(group: ModifierGroup, active: boolean): Promise<ModifierGroup> {
  const res = await apiFetch(`/v1/admin/modifier-groups/${encodeURIComponent(group.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: group.version, active }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar o grupo (${res.status})`);
  return (await res.json()) as ModifierGroup;
}

export async function updateModifierGroup(
  group: ModifierGroup,
  input: Partial<Pick<ModifierGroup, 'name' | 'min' | 'max' | 'pdvCode'>>,
): Promise<ModifierGroup> {
  const res = await apiFetch(`/v1/admin/modifier-groups/${encodeURIComponent(group.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: group.version, ...input }),
  });
  if (!res.ok) throw new Error(`Falha ao atualizar o grupo (${res.status})`);
  return (await res.json()) as ModifierGroup;
}

export async function fetchModifiers(groupId: string): Promise<Modifier[]> {
  const res = await apiFetch(`/v1/admin/modifiers?groupId=${encodeURIComponent(groupId)}`);
  if (!res.ok) throw new Error(`Falha ao carregar complementos (${res.status})`);
  return (await res.json()) as Modifier[];
}

export async function createModifier(input: { groupId: string; name: string; priceDeltaCents: number }): Promise<Modifier> {
  const res = await apiFetch('/v1/admin/modifiers', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao criar complemento (${res.status})`);
  return (await res.json()) as Modifier;
}

export async function fetchProductImages(productId: string): Promise<ProductImage[]> {
  const res = await apiFetch(`/v1/admin/products/${encodeURIComponent(productId)}/images`);
  if (!res.ok) throw new Error(`Falha ao carregar fotos do produto (${res.status})`);
  return (await res.json()) as ProductImage[];
}

export async function addProductImage(productId: string, imageKey: string, position?: number): Promise<ProductImage> {
  const res = await apiFetch(`/v1/admin/products/${encodeURIComponent(productId)}/images`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ imageKey, position }),
  });
  if (!res.ok) throw new Error(`Falha ao vincular foto ao produto (${res.status})`);
  return (await res.json()) as ProductImage;
}

/** Move a foto pra uma posição nova (0 = capa, é o que o cardápio mostra). */
export async function reorderProductImage(productId: string, image: ProductImage, position: number): Promise<ProductImage> {
  const res = await apiFetch(`/v1/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(image.id)}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: image.version, position }),
  });
  if (!res.ok) throw new Error(`Falha ao reordenar foto (${res.status})`);
  return (await res.json()) as ProductImage;
}

export async function deleteProductImage(productId: string, image: ProductImage): Promise<void> {
  const res = await apiFetch(
    `/v1/admin/products/${encodeURIComponent(productId)}/images/${encodeURIComponent(image.id)}?version=${encodeURIComponent(image.version)}`,
    { method: 'DELETE' },
  );
  if (!res.ok) throw new Error(`Falha ao remover foto (${res.status})`);
}

export async function uploadProductImage(productId: string, file: File): Promise<ProductImage> {
  const uploadFile = await compressProductImage(file);
  const uploadUrlRes = await apiFetch(`/v1/admin/products/${encodeURIComponent(productId)}/image/upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ contentType: uploadFile.type, contentLength: uploadFile.size }),
  });
  if (!uploadUrlRes.ok) throw new Error(`Falha ao preparar upload (${uploadUrlRes.status})`);
  const upload = (await uploadUrlRes.json()) as { uploadUrl: string; key: string };
  const putRes = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': uploadFile.type },
    body: uploadFile,
  });
  if (!putRes.ok) throw new Error(`Falha ao enviar foto (${putRes.status})`);
  return addProductImage(productId, upload.key);
}

export async function downloadCatalogTemplate(): Promise<Blob> {
  const res = await apiFetch('/v1/admin/catalog/import/template');
  if (!res.ok) throw new Error(`Falha ao baixar modelo (${res.status})`);
  return res.blob();
}

export async function importCatalog(file: File): Promise<void> {
  const body = new FormData();
  body.set('file', file);
  const res = await apiFetch('/v1/admin/catalog/import/commit', { method: 'POST', body });
  if (!res.ok) throw new Error(`Falha ao importar cardápio (${res.status})`);
}
