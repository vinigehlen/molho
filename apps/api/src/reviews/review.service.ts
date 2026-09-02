import type { ReviewRecord, ReviewRepository } from './review.repository';
import { OrderNotEligibleForReviewError } from './review.errors';

export class ReviewService {
  constructor(private readonly repo: ReviewRepository) {}

  async createForOrder(
    customerId: string,
    orderId: string,
    input: { rating: number; comment?: string },
  ): Promise<ReviewRecord> {
    const order = await this.repo.findOrderForReview(customerId, orderId);
    // D1: só pedido completed da própria cliente — mesma resposta (não
    // distingue "não existe" de "não é seu" de "não terminou"), evita
    // enumerar pedido de outra pessoa por tentativa e erro.
    if (!order || order.status !== 'completed') throw new OrderNotEligibleForReviewError();
    return this.repo.create({ orderId, customerId, ...input });
  }

  reply(id: string, version: number, reply: string): Promise<ReviewRecord> {
    return this.repo.reply(id, version, reply);
  }

  list(): Promise<ReviewRecord[]> {
    return this.repo.list();
  }
}
