import type { StoreBrandUploadUrlResponse, StoreSetup, ThemeKey, UpdateStoreSetupInput } from '@molho/contracts';
import { apiFetch } from './api-client';
import { compressProductImage } from './image-compression';

function setupPath(storeId: string) {
  return `/v1/admin/stores/${encodeURIComponent(storeId)}/setup`;
}

export async function fetchStoreSetup(storeId: string): Promise<StoreSetup> {
  const res = await apiFetch(setupPath(storeId));
  if (!res.ok) throw new Error(`Falha ao carregar loja (${res.status})`);
  return (await res.json()) as StoreSetup;
}

export async function saveStoreSetup(storeId: string, input: UpdateStoreSetupInput): Promise<StoreSetup> {
  const res = await apiFetch(setupPath(storeId), {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Falha ao salvar loja (${res.status})`);
  return (await res.json()) as StoreSetup;
}

export async function saveStoreTheme(storeId: string, themeKey: ThemeKey): Promise<StoreSetup> {
  const res = await apiFetch(`${setupPath(storeId)}/theme`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ themeKey }),
  });
  if (!res.ok) throw new Error(`Falha ao trocar tema (${res.status})`);
  return (await res.json()) as StoreSetup;
}

/** "Publicar minha loja" (Épico 13, fim do wizard) — 400 quando algum passo
 * obrigatório ainda falta; o servidor revalida o checklist de novo, nunca
 * confia só no que o front computou. */
export async function publishStore(storeId: string): Promise<StoreSetup> {
  const res = await apiFetch(`${setupPath(storeId)}/publish`, { method: 'POST' });
  if (!res.ok) {
    const body = await res.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `Falha ao publicar loja (${res.status})`);
  }
  return (await res.json()) as StoreSetup;
}

export async function uploadStoreBrandImage(storeId: string, kind: 'logo' | 'cover', file: File): Promise<string> {
  const uploadFile = await compressProductImage(file);
  const uploadUrlRes = await apiFetch(`${setupPath(storeId)}/brand-upload-url`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind, contentType: uploadFile.type, contentLength: uploadFile.size }),
  });
  if (!uploadUrlRes.ok) throw new Error(`Falha ao preparar upload (${uploadUrlRes.status})`);
  const upload = (await uploadUrlRes.json()) as StoreBrandUploadUrlResponse;
  const putRes = await fetch(upload.uploadUrl, {
    method: 'PUT',
    headers: { 'content-type': uploadFile.type },
    body: uploadFile,
  });
  if (!putRes.ok) throw new Error(`Falha ao enviar imagem (${putRes.status})`);
  return upload.key;
}
