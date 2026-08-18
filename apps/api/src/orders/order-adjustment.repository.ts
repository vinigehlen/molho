import type { OrderAdjustmentKind } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';
import type { OrderStatus } from './order-status-machine';

export interface OrderForAdjustment {
  id: string;
  storeId: string;
  status: OrderStatus;
  subtotalCents: number;
  deliveryFeeCents: number;
  currentSubtotalCents: number | null;
  currentTotalCents: number | null;
}

/** Estado efetivo de um item — original ± Σ ajustes já aplicados sobre ELE (fold, não a linha crua de order_items). */
export interface OrderItemAdjustmentState {
  id: string;
  unitBasePriceCents: number;
  effectiveQuantity: number;
  effectiveLineTotalCents: number;
}

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

export interface CreateAdjustmentOrderItemParams {
  orderId: string;
  productId: string;
  name: string;
  unitBasePriceCents: number;
  quantity: number;
  lineTotalCents: number;
  modifiers: { modifierId: string; name: string; priceDeltaCents: number }[];
}

export interface InsertAdjustmentParams {
  orderId: string;
  orderItemId: string;
  kind: OrderAdjustmentKind;
  quantityDelta: number;
  subtotalDeltaCents: number;
  actorId: string;
  actorRole: string;
  idempotencyKey: string;
}

export interface OrderAdjustmentRepository {
  findOrderForAdjustment(orderId: string): Promise<OrderForAdjustment | null>;
  /** Fast path de replay — mesmo racional de counter-order: retry sequencial acha aqui, sem tocar em nada. */
  hasIdempotencyKey(orderId: string, idempotencyKey: string): Promise<boolean>;
  /** `SELECT ... FOR UPDATE` — fecha a corrida de DOIS ajustes concorrentes no MESMO pedido recalculando o total em cima do mesmo valor base. */
  lockOrderForUpdate(orderId: string): Promise<OrderForAdjustment>;
  findOrderItemState(orderId: string, orderItemId: string): Promise<OrderItemAdjustmentState | null>;
  findProducts(productIds: readonly string[]): Promise<Map<string, CatalogProduct>>;
  findModifiers(modifierIds: readonly string[]): Promise<Map<string, CatalogModifier>>;
  createOrderItem(params: CreateAdjustmentOrderItemParams): Promise<string>;
  /** `inserted: false` ⟺ perdeu a corrida do `ON CONFLICT` — outra request com a MESMA chave já ganhou. */
  insertAdjustment(params: InsertAdjustmentParams): Promise<{ inserted: boolean }>;
  updateOrderCurrentTotals(orderId: string, currentSubtotalCents: number, currentTotalCents: number): Promise<void>;
  recordAuditLog(params: {
    tenantId: string;
    actorId: string;
    actorRole: string;
    orderId: string;
    kind: OrderAdjustmentKind;
    beforeSubtotalCents: number;
    afterSubtotalCents: number;
  }): Promise<void>;
}

/**
 * tenant_id nunca é parâmetro externo: RLS filtra toda leitura pelo GUC da
 * transação do RequestContextService (mesma regra dos outros repositórios
 * de request path).
 */
export class PrismaOrderAdjustmentRepository implements OrderAdjustmentRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findOrderForAdjustment(orderId: string): Promise<OrderForAdjustment | null> {
    return this.requestContext.getClient().order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: {
        id: true,
        storeId: true,
        status: true,
        subtotalCents: true,
        deliveryFeeCents: true,
        currentSubtotalCents: true,
        currentTotalCents: true,
      },
    });
  }

  async hasIdempotencyKey(orderId: string, idempotencyKey: string): Promise<boolean> {
    const existing = await this.requestContext.getClient().orderAdjustment.findFirst({
      where: { orderId, idempotencyKey },
      select: { id: true },
    });
    return existing !== null;
  }

  async lockOrderForUpdate(orderId: string): Promise<OrderForAdjustment> {
    const tenantId = this.requestContext.getTenantId();
    const rows = await this.requestContext.getClient().$queryRaw<OrderForAdjustment[]>`
      SELECT "id", "store_id" AS "storeId", "status", "subtotal_cents" AS "subtotalCents", "delivery_fee_cents" AS "deliveryFeeCents",
             "current_subtotal_cents" AS "currentSubtotalCents", "current_total_cents" AS "currentTotalCents"
      FROM "orders"
      WHERE "id" = ${orderId}::uuid AND "tenant_id" = ${tenantId}::uuid AND "deleted_at" IS NULL
      FOR UPDATE
    `;
    const row = rows[0];
    if (!row) throw new Error('lockOrderForUpdate: pedido sumiu entre a checagem de status e o lock.');
    return row;
  }

  async findOrderItemState(orderId: string, orderItemId: string): Promise<OrderItemAdjustmentState | null> {
    const rows = await this.requestContext.getClient().$queryRaw<
      { id: string; unitBasePriceCents: number; effectiveQuantity: number; effectiveLineTotalCents: number }[]
    >`
      SELECT
        oi."id",
        oi."unit_base_price_cents" AS "unitBasePriceCents",
        oi."quantity" + COALESCE(SUM(oa."quantity_delta"), 0)::int AS "effectiveQuantity",
        oi."line_total_cents" + COALESCE(SUM(oa."subtotal_delta_cents"), 0)::int AS "effectiveLineTotalCents"
      FROM "order_items" oi
      LEFT JOIN "order_adjustments" oa ON oa."order_item_id" = oi."id"
      WHERE oi."id" = ${orderItemId}::uuid AND oi."order_id" = ${orderId}::uuid
      GROUP BY oi."id", oi."unit_base_price_cents", oi."quantity", oi."line_total_cents"
    `;
    return rows[0] ?? null;
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

  async createOrderItem(params: CreateAdjustmentOrderItemParams): Promise<string> {
    const tenantId = this.requestContext.getTenantId();
    const client = this.requestContext.getClient();
    const created = await client.orderItem.create({
      data: {
        tenantId,
        orderId: params.orderId,
        productId: params.productId,
        name: params.name,
        unitBasePriceCents: params.unitBasePriceCents,
        quantity: params.quantity,
        lineTotalCents: params.lineTotalCents,
      },
      select: { id: true },
    });
    if (params.modifiers.length > 0) {
      await client.orderItemModifier.createMany({
        data: params.modifiers.map((modifier) => ({
          tenantId,
          orderItemId: created.id,
          modifierId: modifier.modifierId,
          name: modifier.name,
          priceDeltaCents: modifier.priceDeltaCents,
        })),
      });
    }
    return created.id;
  }

  async insertAdjustment(params: InsertAdjustmentParams): Promise<{ inserted: boolean }> {
    const tenantId = this.requestContext.getTenantId();
    // ON CONFLICT DO NOTHING no par (tenant_id, order_id, idempotency_key) —
    // mesmo padrão idiomático de counter-order: retry de rede com a MESMA
    // chave não duplica, sem depender de capturar código de erro de driver.
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      INSERT INTO "order_adjustments" (
        "tenant_id", "order_id", "order_item_id", "kind",
        "quantity_delta", "subtotal_delta_cents", "actor_id", "actor_role", "idempotency_key"
      ) VALUES (
        ${tenantId}::uuid, ${params.orderId}::uuid, ${params.orderItemId}::uuid, ${params.kind}::"OrderAdjustmentKind",
        ${params.quantityDelta}, ${params.subtotalDeltaCents}, ${params.actorId}::uuid, ${params.actorRole}, ${params.idempotencyKey}
      )
      ON CONFLICT ("tenant_id", "order_id", "idempotency_key") DO NOTHING
      RETURNING "id"
    `;
    return { inserted: rows.length > 0 };
  }

  async updateOrderCurrentTotals(orderId: string, currentSubtotalCents: number, currentTotalCents: number): Promise<void> {
    await this.requestContext.getClient().order.update({
      where: { id: orderId },
      data: { currentSubtotalCents, currentTotalCents },
    });
  }

  async recordAuditLog(params: {
    tenantId: string;
    actorId: string;
    actorRole: string;
    orderId: string;
    kind: OrderAdjustmentKind;
    beforeSubtotalCents: number;
    afterSubtotalCents: number;
  }): Promise<void> {
    await this.requestContext.getClient().auditLog.create({
      data: {
        tenantId: params.tenantId,
        actorId: params.actorId,
        actorRole: params.actorRole,
        action: 'order.adjustment',
        entity: 'order',
        beforeJson: { orderId: params.orderId, subtotalCents: params.beforeSubtotalCents },
        afterJson: { orderId: params.orderId, kind: params.kind, subtotalCents: params.afterSubtotalCents },
      },
    });
  }
}
