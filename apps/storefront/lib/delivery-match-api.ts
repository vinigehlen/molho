import type { DeliveryMatchResponse } from '@molho/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

/**
 * Type guard simples, não zod: a resposta é EFÊMERA (chamada → exibida →
 * descartada), nunca persistida em `localStorage` — ao contrário de
 * `Cart`/`CustomerAddress`, não precisa do aparato de schema
 * versionado/duplicação (`cart-storage.ts`/`address-storage.ts`), que
 * existe especificamente pra sobreviver entre sessões.
 */
function isDeliveryMatchResponse(value: unknown): value is DeliveryMatchResponse {
  if (typeof value !== 'object' || value === null || !('withinZone' in value)) return false;
  const v = value as Record<string, unknown>;
  if (v.withinZone === false) return true;
  return (
    v.withinZone === true &&
    typeof v.zoneName === 'string' &&
    typeof v.feeCents === 'number' &&
    typeof v.etaMinMinutes === 'number' &&
    typeof v.etaMaxMinutes === 'number'
  );
}

/**
 * Chamado a partir de um clique ou do callback de `navigator.geolocation`
 * — nunca do render inicial (é `POST`, precisa de lat/lng em mãos). Devolve
 * `null` pra qualquer falha (rede, não-200, formato inesperado) — nunca
 * lança; quem chama decide a mensagem ("não deu pra confirmar cobertura
 * agora" é sempre mais honesto que estourar a tela).
 */
export async function fetchDeliveryMatch(
  slug: string,
  lat: number,
  lng: number,
): Promise<DeliveryMatchResponse | null> {
  let response: Response;
  try {
    response = await fetch(`${API_URL}/v1/store/${encodeURIComponent(slug)}/delivery-match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng }),
    });
  } catch {
    return null;
  }

  if (!response.ok) return null;

  const body: unknown = await response.json();
  return isDeliveryMatchResponse(body) ? body : null;
}
