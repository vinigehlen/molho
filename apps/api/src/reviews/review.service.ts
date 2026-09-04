import type { OrderForReview, ReviewRecord, ReviewRepository } from './review.repository';
import { OrderNotEligibleForReviewError } from './review.errors';

export class ReviewService {
  constructor(private readonly repo: ReviewRepository) {}

  async createForOrder(
    customerId: string,
    orderId: string,
    input: { rating: number; comment?: string },
  ): Promise<ReviewRecord> {
    const order = await this.repo.findOrderForReview(customerId, orderId);
    return this.createForResolvedOrder(order, input);
  }

  /**
   * Épico 16.3 — mesma elegibilidade (D1: só `completed`), mas a origem da
   * autorização é o token opaco do acompanhamento (pedido guest, sem JWT —
   * CLAUDE.md regra 13), não o `sub` de um JWT de cliente. O índice único
   * parcial `(tenant_id, order_id)` já impede duplicata não importa por qual
   * das duas portas o pedido foi avaliado primeiro.
   */
  async createForOrderByToken(token: string, input: { rating: number; comment?: string }): Promise<ReviewRecord> {
    const order = await this.repo.findOrderForReviewByToken(token);
    return this.createForResolvedOrder(order, input);
  }

  private async createForResolvedOrder(
    order: OrderForReview | null,
    input: { rating: number; comment?: string },
  ): Promise<ReviewRecord> {
    // D1: só pedido completed — mesma resposta genérica (não distingue "não
    // existe" de "não é seu" de "não terminou"), evita enumerar pedido de
    // outra pessoa por tentativa e erro.
    if (!order || order.status !== 'completed') throw new OrderNotEligibleForReviewError();
    return this.repo.create({ orderId: order.id, customerId: order.customerId, ...input });
  }

  reply(id: string, version: number, reply: string): Promise<ReviewRecord> {
    return this.repo.reply(id, version, reply);
  }

  list(): Promise<ReviewRecord[]> {
    return this.repo.list();
  }
}
