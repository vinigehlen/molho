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
