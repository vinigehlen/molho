import { apiFetch } from './api-client';

export interface Review {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
  version: number;
}

export async function fetchReviews(): Promise<Review[]> {
  const res = await apiFetch('/v1/admin/reviews');
  if (!res.ok) throw new Error(`Falha ao carregar avaliações (${res.status})`);
  return (await res.json()) as Review[];
}

export async function replyReview(review: Review, reply: string): Promise<Review> {
  const res = await apiFetch(`/v1/admin/reviews/${encodeURIComponent(review.id)}/reply`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ version: review.version, reply }),
  });
  if (!res.ok) throw new Error(`Falha ao responder avaliação (${res.status})`);
  return (await res.json()) as Review;
}
