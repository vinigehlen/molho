import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import { ReviewAlreadyExistsError, ReviewConflictError, ReviewNotFoundError } from './review.errors';

export interface ReviewRecord {
  id: string;
  orderId: string;
  rating: number;
  comment: string | null;
  reply: string | null;
  repliedAt: Date | null;
  createdAt: Date;
  version: number;
}

export interface OrderForReview {
  id: string;
  customerId: string;
  status: string;
}

const SELECT = {
  id: true,
  orderId: true,
  rating: true,
  comment: true,
  reply: true,
  repliedAt: true,
  createdAt: true,
  version: true,
} as const;

export interface ReviewRepository {
  findOrderForReview(customerId: string, orderId: string): Promise<OrderForReview | null>;
  create(input: { orderId: string; customerId: string; rating: number; comment?: string }): Promise<ReviewRecord>;
  findById(id: string): Promise<ReviewRecord | null>;
  reply(id: string, version: number, reply: string): Promise<ReviewRecord>;
  list(): Promise<ReviewRecord[]>;
}

export class PrismaReviewRepository implements ReviewRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  /** D1: só pedido `completed` da PRÓPRIA cliente pode ser avaliado. */
  async findOrderForReview(customerId: string, orderId: string): Promise<OrderForReview | null> {
    const client = this.requestContext.getClient();
    return client.order.findFirst({
      where: { id: orderId, customerId, deletedAt: null },
      select: { id: true, customerId: true, status: true },
    });
  }

  async create(input: { orderId: string; customerId: string; rating: number; comment?: string }): Promise<ReviewRecord> {
    const client = this.requestContext.getClient();
    try {
      return await client.review.create({
        data: {
          tenantId: this.requestContext.getTenantId(),
          orderId: input.orderId,
          customerId: input.customerId,
          rating: input.rating,
          comment: input.comment ?? null,
        },
        select: SELECT,
      });
    } catch (error) {
      // Índice único parcial (tenant_id, order_id) WHERE deleted_at IS NULL.
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ReviewAlreadyExistsError();
      }
      throw error;
    }
  }

  async findById(id: string): Promise<ReviewRecord | null> {
    const client = this.requestContext.getClient();
    return client.review.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  /** Optimistic lock (`WHERE version = :esperado`) — mesmo padrão do resto do repo. */
  async reply(id: string, version: number, reply: string): Promise<ReviewRecord> {
    const client = this.requestContext.getClient();
    const result = await client.review.updateMany({
      where: { id, version, deletedAt: null },
      data: { reply, repliedAt: new Date(), version: { increment: 1 } },
    });
    if (result.count === 0) {
      const exists = await client.review.findFirst({ where: { id, deletedAt: null }, select: { id: true } });
      throw exists ? new ReviewConflictError() : new ReviewNotFoundError();
    }
    const updated = await client.review.findFirst({ where: { id }, select: SELECT });
    if (!updated) throw new ReviewNotFoundError();
    return updated;
  }

  /** Lista pro backoffice (Épico 16) — mais recentes primeiro. */
  async list(): Promise<ReviewRecord[]> {
    const client = this.requestContext.getClient();
    return client.review.findMany({ where: { deletedAt: null }, orderBy: { createdAt: 'desc' }, select: SELECT, take: 100 });
  }
}
