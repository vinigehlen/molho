import type { CheckoutAddressInput, RevalidatedCheckout, RevalidatedItem } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';

export interface CreateOrderParams {
  storeId: string;
  customerId: string;
  deliveryAddressId: string;
  address: CheckoutAddressInput;
  /** Já garantido `withinZone && canSubmit` por quem chama — deliveryFeeCents/totalCents nunca nulos aqui. */
  revalidated: RevalidatedCheckout;
}

export interface CheckoutOrderRepository {
  /** RLS tenant-scoped normal (sem bypass de plataforma) — null tanto pra "não existe" quanto pra "é de outro tenant", de propósito (mesma ambiguidade de CatalogNotFoundError). */
  findCustomer(customerId: string): Promise<{ id: string } | null>;
  /** MVP assume uma loja por tenant (mesma suposição de StorefrontRepository/CheckoutRepository). */
  findStoreId(): Promise<string | null>;
  /**
   * `SELECT ... FOR UPDATE` nas linhas de PRODUTO do pedido — só chamado no
   * caminho de `/checkout/orders` (criação), NUNCA em
   * `CheckoutRevalidationService.revalidate()` (que também atende
   * `/checkout/revalidate`, público e só-leitura). Fecha a janela de corrida
   * entre ler preço/disponibilidade e escrever o pedido pro que tem
   * consequência de dinheiro/consentimento do cliente — ver CLAUDE.md §
   * Checkout pra decisão completa (zona/horário/mínimo ficam de fora,
   * de propósito, como débito tolerável sob READ COMMITTED).
   */
  lockProductsForUpdate(productIds: readonly string[]): Promise<void>;
  /** Grava o endereço do localStorage como linha real, vinculada ao customer autenticado (CLAUDE.md regra 13). */
  createAddress(customerId: string, address: CheckoutAddressInput): Promise<string>;
  createOrder(params: CreateOrderParams): Promise<string>;
  createOrderItems(orderId: string, items: readonly RevalidatedItem[]): Promise<void>;
}

/**
 * `deliveryGeo`/`geo` são `Unsupported("geography(Point, 4326)")` no Prisma
 * DSL — a API fluente (`.create()`) não os aceita de jeito nenhum (nem
 * omitir funciona: a coluna é NOT NULL sem default, INSERT sem ela quebra a
 * constraint). Por isso `orders` e `addresses` nascem por `$queryRaw` +
 * `RETURNING id`, igual ao padrão de leitura já usado em
 * `PrismaDeliveryMatchRepository` — aqui só do lado da ESCRITA.
 *
 * tenant_id nunca é parâmetro externo: cada método lê
 * `this.requestContext.getTenantId()` (mesmo padrão de PrismaCategoryRepository).
 */
export class PrismaCheckoutOrderRepository implements CheckoutOrderRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findCustomer(customerId: string): Promise<{ id: string } | null> {
    return this.requestContext.getClient().customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true },
    });
  }

  async findStoreId(): Promise<string | null> {
    const store = await this.requestContext.getClient().store.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true },
    });
    return store?.id ?? null;
  }

  async lockProductsForUpdate(productIds: readonly string[]): Promise<void> {
    if (productIds.length === 0) return;
    await this.requestContext.getClient().$queryRaw`
      SELECT "id" FROM "products" WHERE "id" = ANY(${productIds}::uuid[]) AND "deleted_at" IS NULL FOR UPDATE
    `;
  }

  async createAddress(customerId: string, address: CheckoutAddressInput): Promise<string> {
    const tenantId = this.requestContext.getTenantId();
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      INSERT INTO "addresses" (
        "tenant_id", "customer_id", "label", "street", "number", "complement",
        "neighborhood", "city", "state", "postal_code", "reference_point", "geo"
      ) VALUES (
        ${tenantId}::uuid, ${customerId}::uuid, ${address.label}, ${address.street}, ${address.number}, ${address.complement},
        ${address.neighborhood}, ${address.city}, ${address.state}, ${address.postalCode}, ${address.referencePoint},
        ST_SetSRID(ST_MakePoint(${address.lng}, ${address.lat}), 4326)::geography
      )
      RETURNING "id"
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error('INSERT em addresses não devolveu id.');
    return id;
  }

  async createOrder(params: CreateOrderParams): Promise<string> {
    const tenantId = this.requestContext.getTenantId();
    const { storeId, customerId, deliveryAddressId, address, revalidated } = params;
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      INSERT INTO "orders" (
        "tenant_id", "store_id", "customer_id", "status", "payment_status", "refund_status",
        "subtotal_cents", "delivery_fee_cents", "total_cents",
        "delivery_address_id", "delivery_label", "delivery_street", "delivery_number", "delivery_complement",
        "delivery_neighborhood", "delivery_city", "delivery_state", "delivery_postal_code", "delivery_reference_point",
        "delivery_geo"
      ) VALUES (
        ${tenantId}::uuid, ${storeId}::uuid, ${customerId}::uuid, 'received', 'aguardando_confirmacao', 'not_applicable',
        ${revalidated.subtotalCents}, ${revalidated.deliveryFeeCents}, ${revalidated.totalCents},
        ${deliveryAddressId}::uuid, ${address.label}, ${address.street}, ${address.number}, ${address.complement},
        ${address.neighborhood}, ${address.city}, ${address.state}, ${address.postalCode}, ${address.referencePoint},
        ST_SetSRID(ST_MakePoint(${address.lng}, ${address.lat}), 4326)::geography
      )
      RETURNING "id"
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error('INSERT em orders não devolveu id.');
    return id;
  }

  async createOrderItems(orderId: string, items: readonly RevalidatedItem[]): Promise<void> {
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
