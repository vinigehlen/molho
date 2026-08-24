import type { CreateDeliveryZoneInput, DeliveryZoneResponse, UpdateDeliveryZoneInput } from '@molho/contracts';
import { apiFetch } from './api-client';

export type { DeliveryZoneResponse };

export class DeliveryZoneDuplicateError extends Error {
  constructor(message = 'Já existe uma zona para esta cidade e UF nesta loja.') {
    super(message);
  }
}

/** 409 do If-Match — zona foi alterada por outra pessoa desde que a tela carregou. */
export class DeliveryZoneStaleVersionError extends Error {
  constructor(message = 'Zona alterada por outra pessoa. Recarregando a versão mais recente.') {
    super(message);
  }
}

function storePath(storeId: string) {
  return `/v1/admin/stores/${encodeURIComponent(storeId)}/delivery-zones`;
}

function zonePath(zoneId: string) {
  return `/v1/admin/delivery-zones/${encodeURIComponent(zoneId)}`;
}

async function errorMessage(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { message?: unknown } | null;
  return typeof body?.message === 'string' ? body.message : fallback;
}

export async function fetchDeliveryZones(storeId: string): Promise<DeliveryZoneResponse[]> {
  const res = await apiFetch(storePath(storeId));
  if (!res.ok) throw new Error(`Falha ao carregar zonas (${res.status})`);
  return (await res.json()) as DeliveryZoneResponse[];
}

export async function createDeliveryZone(
  storeId: string,
  input: CreateDeliveryZoneInput,
): Promise<DeliveryZoneResponse> {
  const res = await apiFetch(storePath(storeId), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (res.status === 409) throw new DeliveryZoneDuplicateError(await errorMessage(res, 'Zona duplicada.'));
  if (!res.ok) throw new Error(`Falha ao salvar zona (${res.status})`);
  return (await res.json()) as DeliveryZoneResponse;
}

export async function updateDeliveryZone(
  zoneId: string,
  version: number,
  input: UpdateDeliveryZoneInput,
): Promise<DeliveryZoneResponse> {
  const res = await apiFetch(zonePath(zoneId), {
    method: 'PATCH',
    headers: { 'content-type': 'application/json', 'if-match': String(version) },
    body: JSON.stringify(input),
  });

  if (res.status === 409) throw await conflictError(res);
  if (!res.ok) throw new Error(`Falha ao salvar zona (${res.status})`);
  return (await res.json()) as DeliveryZoneResponse;
}

export async function deleteDeliveryZone(zoneId: string, version: number): Promise<void> {
  const res = await apiFetch(zonePath(zoneId), { method: 'DELETE', headers: { 'if-match': String(version) } });
  if (res.status === 409) throw await conflictError(res);
  if (!res.ok) throw new Error(`Falha ao excluir zona (${res.status})`);
}

/** 409 de PATCH/DELETE é duplicata de cidade OU version obsoleta — distingue pela mensagem do servidor. */
async function conflictError(res: Response): Promise<Error> {
  const message = await errorMessage(res, 'Zona duplicada.');
  if (message.includes('alterada por outra')) return new DeliveryZoneStaleVersionError(message);
  return new DeliveryZoneDuplicateError(message);
}
