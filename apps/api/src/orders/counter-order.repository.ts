import type { RequestContextService } from '../context/request-context.service';

export interface CatalogProduct {
  id: string;
  name: string;
  basePriceCents: number;
}

export interface CatalogModifier {
  id: string;
  name: string;
  priceDeltaCents: number;
}

/** Item já com o preço decidido pelo servidor — pronto pra virar OrderItem. */
export interface PricedCounterItem {
  productId: string;
  name: string;
  unitBasePriceCents: number;
  quantity: number;
  notes: string | null;
  lineTotalCents: number;
  modifiers: { modifierId: string; name: string; priceDeltaCents: number }[];
}

export interface ExistingCounterOrder {
  id: string;
  paymentMethod: string;
  subtotalCents: number;
  totalCents: number;
}

export interface CreateCounterOrderParams {
  storeId: string;
  customerId: string;
  paymentMethod: string;
  subtotalCents: number;
  totalCents: number;
  notes: string | null;
  idempotencyKey: string;
  createdAt: Date;
}

export interface CounterOrderRepository {
  findStore(storeId: string): Promise<{ id: string } | null>;
  findProducts(productIds: readonly string[]): Promise<Map<string, CatalogProduct>>;
  findModifiers(modifierIds: readonly string[]): Promise<Map<string, CatalogModifier>>;
  findOrderByIdempotencyKey(idempotencyKey: string): Promise<ExistingCounterOrder | null>;
  createAnonymousCustomer(name: string): Promise<string>;
  /** `created: false` ⟺ perdeu a corrida do `ON CONFLICT` — outra request com a MESMA chave já criou o pedido. */
  createOrder(params: CreateCounterOrderParams): Promise<{ id: string; created: boolean }>;
  createOrderItems(orderId: string, items: readonly PricedCounterItem[]): Promise<void>;
}

/**
 * `orders` tem coluna `Unsupported("geography(Point, 4326)")` (delivery_geo)
 * — a API fluente do Prisma não a aceita de jeito nenhum, nem omitindo
 * (mesmo racional de PrismaCheckoutOrderRepository.createOrder). Por isso
 * `createOrder` também nasce por `$queryRaw` + `RETURNING id` aqui.
 */
export class PrismaCounterOrderRepository implements CounterOrderRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findStore(storeId: string): Promise<{ id: string } | null> {
    return this.requestContext.getClient().store.findFirst({
      where: { id: storeId, deletedAt: null },
      select: { id: true },
    });
  }

  async findProducts(productIds: readonly string[]): Promise<Map<string, CatalogProduct>> {
    if (productIds.length === 0) return new Map();
    const rows = await this.requestContext.getClient().product.findMany({
      where: { id: { in: [...productIds] }, deletedAt: null },
      select: { id: true, name: true, basePriceCents: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async findModifiers(modifierIds: readonly string[]): Promise<Map<string, CatalogModifier>> {
    if (modifierIds.length === 0) return new Map();
    const rows = await this.requestContext.getClient().modifier.findMany({
      where: { id: { in: [...modifierIds] }, deletedAt: null },
      select: { id: true, name: true, priceDeltaCents: true },
    });
    return new Map(rows.map((row) => [row.id, row]));
  }

  async findOrderByIdempotencyKey(idempotencyKey: string): Promise<ExistingCounterOrder | null> {
    const tenantId = this.requestContext.getTenantId();
    return this.requestContext.getClient().order.findFirst({
      where: { tenantId, idempotencyKey, deletedAt: null },
      select: { id: true, paymentMethod: true, subtotalCents: true, totalCents: true },
    });
  }

  async createAnonymousCustomer(name: string): Promise<string> {
    const tenantId = this.requestContext.getTenantId();
    const customer = await this.requestContext.getClient().customer.create({
      data: { tenantId, name },
      select: { id: true },
    });
    return customer.id;
  }

  async createOrder(params: CreateCounterOrderParams): Promise<{ id: string; created: boolean }> {
    const tenantId = this.requestContext.getTenantId();
    const { storeId, customerId, paymentMethod, subtotalCents, totalCents, notes, idempotencyKey, createdAt } = params;
    // ON CONFLICT DO NOTHING no par (tenant_id, idempotency_key): retry de
    // rede com a MESMA chave não duplica — 0 linhas devolvidas = outra
    // request já ganhou a corrida, o chamador reconsulta por
    // findOrderByIdempotencyKey (mesmo padrão idiomático de INSERT
    // idempotente do Postgres, sem depender de capturar código de erro de
    // driver numa query raw).
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      INSERT INTO "orders" (
        "tenant_id", "store_id", "customer_id", "status", "payment_method", "payment_status", "refund_status",
        "fulfillment_type", "change_for_cents",
        "subtotal_cents", "delivery_fee_cents", "total_cents",
        "delivery_geo", "delivery_postal_code_verified", "customer_verified",
        "notes", "idempotency_key", "created_at"
      ) VALUES (
        ${tenantId}::uuid, ${storeId}::uuid, ${customerId}::uuid, 'completed', ${paymentMethod}::"PaymentMethod", 'confirmado', 'not_applicable',
        'pickup', NULL,
        ${subtotalCents}, 0, ${totalCents},
        NULL, true, false,
        ${notes}, ${idempotencyKey}, ${createdAt}
      )
      ON CONFLICT ("tenant_id", "idempotency_key") DO NOTHING
      RETURNING "id"
    `;
    const id = rows[0]?.id;
    if (id) return { id, created: true };

    const existing = await this.findOrderByIdempotencyKey(idempotencyKey);
    if (!existing) throw new Error('INSERT em orders colidiu no ON CONFLICT mas o SELECT de replay não achou nada.');
    return { id: existing.id, created: false };
  }

  async createOrderItems(orderId: string, items: readonly PricedCounterItem[]): Promise<void> {
    const tenantId = this.requestContext.getTenantId();
    const client = this.requestContext.getClient();
    for (const item of items) {
      const createdItem = await client.orderItem.create({
        data: {
          tenantId,
          orderId,
          productId: item.productId,
          name: item.name,
          unitBasePriceCents: item.unitBasePriceCents,
          quantity: item.quantity,
          notes: item.notes,
          lineTotalCents: item.lineTotalCents,
        },
        select: { id: true },
      });
      if (item.modifiers.length === 0) continue;
      await client.orderItemModifier.createMany({
        data: item.modifiers.map((modifier) => ({
          tenantId,
          orderItemId: createdItem.id,
          modifierId: modifier.modifierId,
          name: modifier.name,
          priceDeltaCents: modifier.priceDeltaCents,
        })),
      });
    }
  }
}
