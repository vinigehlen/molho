import { describe, expect, it } from 'vitest';
import { OrderNotEligibleForReviewError, ReviewAlreadyExistsError, ReviewConflictError, ReviewNotFoundError } from './review.errors';
import type { OrderForReview, ReviewRecord, ReviewRepository } from './review.repository';
import { ReviewService } from './review.service';

function record(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: 'review-1',
    orderId: 'order-1',
    rating: 5,
    comment: null,
    reply: null,
    repliedAt: null,
    createdAt: new Date('2026-09-02T00:00:00Z'),
    version: 0,
    ...overrides,
  };
}

class FakeReviewRepository implements ReviewRepository {
  orders = new Map<string, OrderForReview>();
  rows = new Map<string, ReviewRecord>();
  createdFor = new Set<string>();

  async findOrderForReview(customerId: string, orderId: string): Promise<OrderForReview | null> {
    const order = this.orders.get(orderId);
    if (!order || order.customerId !== customerId) return null;
    return order;
  }

  async create(input: { orderId: string; customerId: string; rating: number; comment?: string }): Promise<ReviewRecord> {
    if (this.createdFor.has(input.orderId)) throw new ReviewAlreadyExistsError();
    this.createdFor.add(input.orderId);
    const row = record({ id: `review-${input.orderId}`, orderId: input.orderId, rating: input.rating, comment: input.comment ?? null });
    this.rows.set(row.id, row);
    return row;
  }

  async findById(id: string): Promise<ReviewRecord | null> {
    return this.rows.get(id) ?? null;
  }

  async reply(id: string, version: number, reply: string): Promise<ReviewRecord> {
    const row = this.rows.get(id);
    if (!row) throw new ReviewNotFoundError();
    if (row.version !== version) throw new ReviewConflictError();
    const updated = { ...row, reply, repliedAt: new Date(), version: row.version + 1 };
    this.rows.set(id, updated);
    return updated;
  }

  async list(): Promise<ReviewRecord[]> {
    return [...this.rows.values()];
  }
}

describe('ReviewService.createForOrder', () => {
  it('cria quando o pedido é completed e da própria cliente', async () => {
    const repo = new FakeReviewRepository();
    repo.orders.set('order-1', { id: 'order-1', customerId: 'cust-1', status: 'completed' });
    const service = new ReviewService(repo);

    const review = await service.createForOrder('cust-1', 'order-1', { rating: 5, comment: 'Ótimo!' });

    expect(review.rating).toBe(5);
  });

  it('rejeita pedido que ainda não terminou', async () => {
    const repo = new FakeReviewRepository();
    repo.orders.set('order-1', { id: 'order-1', customerId: 'cust-1', status: 'preparing' });
    const service = new ReviewService(repo);

    await expect(service.createForOrder('cust-1', 'order-1', { rating: 5 })).rejects.toThrow(OrderNotEligibleForReviewError);
  });

  it('rejeita pedido de OUTRA cliente — mesma mensagem de "não existe" (sem enumeração)', async () => {
    const repo = new FakeReviewRepository();
    repo.orders.set('order-1', { id: 'order-1', customerId: 'cust-2', status: 'completed' });
    const service = new ReviewService(repo);

    await expect(service.createForOrder('cust-1', 'order-1', { rating: 5 })).rejects.toThrow(OrderNotEligibleForReviewError);
  });

  it('pedido inexistente: mesmo erro', async () => {
    const repo = new FakeReviewRepository();
    const service = new ReviewService(repo);

    await expect(service.createForOrder('cust-1', 'order-inexistente', { rating: 5 })).rejects.toThrow(OrderNotEligibleForReviewError);
  });

  it('segundo review no mesmo pedido: conflito', async () => {
    const repo = new FakeReviewRepository();
    repo.orders.set('order-1', { id: 'order-1', customerId: 'cust-1', status: 'completed' });
    const service = new ReviewService(repo);
    await service.createForOrder('cust-1', 'order-1', { rating: 5 });

    await expect(service.createForOrder('cust-1', 'order-1', { rating: 1 })).rejects.toThrow(ReviewAlreadyExistsError);
  });
});

describe('ReviewService.reply', () => {
  it('lojista responde: grava reply + repliedAt, incrementa version', async () => {
    const repo = new FakeReviewRepository();
    repo.rows.set('review-1', record());
    const service = new ReviewService(repo);

    const updated = await service.reply('review-1', 0, 'Obrigado pela visita!');

    expect(updated.reply).toBe('Obrigado pela visita!');
    expect(updated.repliedAt).not.toBeNull();
    expect(updated.version).toBe(1);
  });

  it('version errada: conflito, não sobrescreve resposta concorrente', async () => {
    const repo = new FakeReviewRepository();
    repo.rows.set('review-1', record());
    const service = new ReviewService(repo);

    await expect(service.reply('review-1', 99, 'Tarde demais')).rejects.toThrow(ReviewConflictError);
  });

  it('review inexistente: not found', async () => {
    const repo = new FakeReviewRepository();
    const service = new ReviewService(repo);

    await expect(service.reply('nao-existe', 0, 'oi')).rejects.toThrow(ReviewNotFoundError);
  });
});
