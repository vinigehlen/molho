import type { OrderTrackingResponse } from '@molho/contracts';

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

export async function getOrderTracking(slug: string, token: string): Promise<OrderTrackingResponse | null> {
  let response: Response;
  try {
    response = await fetch(
      `${API_URL}/v1/store/${encodeURIComponent(slug)}/track/${encodeURIComponent(token)}`,
      { cache: 'no-store' },
    );
  } catch {
    return null;
  }

  if (!response.ok) return null;
  const data: unknown = await response.json().catch(() => null);
  return data as OrderTrackingResponse | null;
}

export class ReviewAlreadyExistsError extends Error {}

/**
 * Avaliação de pedido GUEST (Épico 16.3, [16-D1]) — o token opaco do
 * acompanhamento É a autorização (CLAUDE.md regra 13, sem JWT nenhum),
 * mesmo racional de `createReview` (customer-profile-api.ts) do lado
 * autenticado.
 */
export async function createTrackReview(
  slug: string,
  token: string,
  input: { rating: number; comment?: string },
): Promise<void> {
  const response = await fetch(
    `${API_URL}/v1/store/${encodeURIComponent(slug)}/track/${encodeURIComponent(token)}/review`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    },
  );
  if (response.status === 409) throw new ReviewAlreadyExistsError('Esse pedido já foi avaliado.');
  if (response.status === 403) throw new Error('Esse pedido não pode ser avaliado.');
  if (!response.ok) throw new Error('Não deu pra enviar sua avaliação agora.');
}
