import type { CheckoutAddressInput, FulfillmentType, PaymentMethod, RevalidatedCheckout, RevalidatedItem } from '@molho/contracts';
import { Prisma } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';
import type { ResolvedAddress } from '../geo/resolve-address';

/**
 * O endereço que vai pro banco: o que o cliente digitou (rótulo, número,
 * complemento, CEP, referência) MAIS o que o servidor resolveu (rua, bairro,
 * cidade, UF, ponto). Montado uma vez em `CheckoutOrderService` e usado nas
 * duas escritas (`addresses` e o snapshot em `orders`), pra não existir
 * chance de a linha e o snapshot divergirem.
 */
export interface DeliveryAddressSnapshot extends ResolvedAddress {
  label: string;
  number: string;
  complement: string | null;
  postalCode: string;
  referencePoint: string | null;
}

/** `null` ⟺ pickup (nem `input` nem `resolved` existem nesse branch — retirada não tem endereço de cliente nenhum). */
export function toDeliverySnapshot(
  input: CheckoutAddressInput | null,
  resolved: ResolvedAddress | null,
): DeliveryAddressSnapshot | null {
  if (!input || !resolved) return null;
  return {
    ...resolved,
    label: input.label,
    number: input.number,
    complement: input.complement,
    postalCode: input.postalCode,
    referencePoint: input.referencePoint,
  };
}

export interface CreateOrderParams {
  storeId: string;
  customerId: string;
  fulfillmentType: FulfillmentType;
  /** `null` ⟺ pickup — os dois nascem/morrem juntos, garantido por quem chama (`CheckoutOrderService`). */
  deliveryAddressId: string | null;
  address: DeliveryAddressSnapshot | null;
  /** Já garantido `withinZone && canSubmit` por quem chama — deliveryFeeCents/totalCents nunca nulos aqui. */
  revalidated: RevalidatedCheckout;
  paymentMethod: PaymentMethod;
  /** Só relevante quando paymentMethod === 'cash_on_delivery' — null nos outros dois (CLAUDE.md regra 4 não se aplica aqui, é ausência de troco, não zero). */
  changeForCents: number | null;
  /** Snapshot da procedência da identidade (Épico 9c): `false` = pedido guest, telefone auto-declarado. Ver o comentário do campo no schema. */
  customerVerified: boolean;
  /** Mesmo instante-base usado no prazo, para não depender de dois relógios. */
  createdAt: Date;
  fulfillmentDeadlineAt: Date;
  /**
   * Cupom (Épico conversão, C2) — `null`/`0` nos três juntos, ou os três
   * preenchidos juntos (mesmo CHECK `orders_discount_coupon_consistency_check`
   * no banco). Vem do resultado de `claimCoupon()`, nunca montado à mão por
   * quem chama `createOrder` — só depois do incremento atômico de
   * `uses_count` ter sido bem-sucedido é que o desconto é real.
   */
  couponId: string | null;
  couponCodeSnapshot: string | null;
  discountCents: number;
}

/** Campos da loja que o checkout precisa pra montar o QR PIX (Épico 8) — nunca a Store inteira, só o recorte deste caso de uso. */
export interface StoreForOrder {
  id: string;
  pixKey: string | null;
  pixKeyType: string | null;
  pixMerchantCity: string | null;
  name: string;
}

export interface CheckoutOrderRepository {
  /**
   * RLS tenant-scoped normal (sem bypass de plataforma) — null tanto pra "não
   * existe" quanto pra "é de outro tenant", de propósito (mesma ambiguidade de
   * CatalogNotFoundError). `phoneVerifiedAt` sai junto porque é ele, e não a
   * presença do token, que decide `orders.customer_verified`.
   */
  findCustomer(customerId: string): Promise<{ id: string; phoneVerifiedAt: Date | null } | null>;
  /** MVP assume uma loja por tenant (mesma suposição de StorefrontRepository/CheckoutRepository). */
  findStore(): Promise<StoreForOrder | null>;
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
  /**
   * Incremento ATÔMICO de `uses_count` (Épico conversão, C2, docs/handoff
   * A2) — `UPDATE ... WHERE uses_count < max_uses`, mesmo padrão do
   * optimistic lock de zona (P1.2). `null` = perdeu a corrida (outro pedido
   * esgotou o cupom nos milissegundos entre a revalidação e aqui) — quem
   * chama trata como divergência, nunca aplica desconto sem o claim ter
   * confirmado uso disponível de verdade.
   */
  claimCoupon(code: string): Promise<{ couponId: string; couponCodeSnapshot: string } | null>;
  /** Grava o endereço do localStorage como linha real, vinculada ao customer autenticado (CLAUDE.md regra 13). */
  createAddress(customerId: string, address: DeliveryAddressSnapshot): Promise<string>;
  createOrder(params: CreateOrderParams): Promise<string>;
  createOrderItems(orderId: string, items: readonly RevalidatedItem[]): Promise<void>;
}

/**
 * Ponto NULO é caso normal (Épico 6, Bloco 2): a zona por município decide a
 * taxa sem coordenada nenhuma. `ST_MakePoint(NULL, NULL)` já resultaria em
 * NULL, mas o `Prisma.sql` explícito deixa a intenção visível e evita
 * depender de propagação de NULL dentro do PostGIS.
 */
function pontoOuNulo(address: DeliveryAddressSnapshot | null) {
  if (!address || address.lat === null || address.lng === null) return Prisma.sql`NULL`;
  return Prisma.sql`ST_SetSRID(ST_MakePoint(${address.lng}, ${address.lat}), 4326)::geography`;
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

  async findCustomer(customerId: string): Promise<{ id: string; phoneVerifiedAt: Date | null } | null> {
    return this.requestContext.getClient().customer.findFirst({
      where: { id: customerId, deletedAt: null },
      select: { id: true, phoneVerifiedAt: true },
    });
  }

  async findStore(): Promise<StoreForOrder | null> {
    return this.requestContext.getClient().store.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: { id: true, pixKey: true, pixKeyType: true, pixMerchantCity: true, name: true },
    });
  }

  async lockProductsForUpdate(productIds: readonly string[]): Promise<void> {
    if (productIds.length === 0) return;
    await this.requestContext.getClient().$queryRaw`
      SELECT "id" FROM "products" WHERE "id" = ANY(${productIds}::uuid[]) AND "deleted_at" IS NULL FOR UPDATE
    `;
  }

  async claimCoupon(code: string): Promise<{ couponId: string; couponCodeSnapshot: string } | null> {
    const tenantId = this.requestContext.getTenantId();
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string; code: string }[]>`
      UPDATE "coupons"
      SET "uses_count" = "uses_count" + 1, "version" = "version" + 1
      WHERE "tenant_id" = ${tenantId}::uuid
        AND upper("code") = upper(${code})
        AND "deleted_at" IS NULL
        AND "uses_count" < "max_uses"
      RETURNING "id", "code"
    `;
    const row = rows[0];
    return row ? { couponId: row.id, couponCodeSnapshot: row.code } : null;
  }

  async createAddress(customerId: string, address: DeliveryAddressSnapshot): Promise<string> {
    const tenantId = this.requestContext.getTenantId();
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      INSERT INTO "addresses" (
        "tenant_id", "customer_id", "label", "street", "number", "complement",
        "neighborhood", "city", "state", "postal_code", "reference_point", "geo"
      ) VALUES (
        ${tenantId}::uuid, ${customerId}::uuid, ${address.label}, ${address.street}, ${address.number}, ${address.complement},
        ${address.neighborhood}, ${address.city}, ${address.state}, ${address.postalCode}, ${address.referencePoint},
        ${pontoOuNulo(address)}
      )
      RETURNING "id"
    `;
    const id = rows[0]?.id;
    if (!id) throw new Error('INSERT em addresses não devolveu id.');
    return id;
  }

  async createOrder(params: CreateOrderParams): Promise<string> {
    const tenantId = this.requestContext.getTenantId();
    const {
      storeId,
      customerId,
      fulfillmentType,
      deliveryAddressId,
      address,
      revalidated,
      paymentMethod,
      changeForCents,
      customerVerified,
      createdAt,
      fulfillmentDeadlineAt,
      couponId,
      couponCodeSnapshot,
      discountCents,
    } = params;
    // `address`/`deliveryAddressId` nulos ⟺ pickup — o CHECK
    // `orders_delivery_requires_address_check` (migration) barra a
    // combinação inválida no banco, não só na aplicação. `postalCodeVerified`
    // é irrelevante em pickup (nunca há CEP pra ficar mudo) — `true` fixo lá,
    // igual ao default da coluna.
    const rows = await this.requestContext.getClient().$queryRaw<{ id: string }[]>`
      INSERT INTO "orders" (
        "tenant_id", "store_id", "customer_id", "status", "payment_method", "payment_status", "refund_status",
        "fulfillment_type",
        "change_for_cents",
        "subtotal_cents", "delivery_fee_cents", "total_cents",
        "discount_cents", "coupon_id", "coupon_code_snapshot",
        "delivery_address_id", "delivery_label", "delivery_street", "delivery_number", "delivery_complement",
        "delivery_neighborhood", "delivery_city", "delivery_state", "delivery_postal_code", "delivery_reference_point",
        "delivery_geo", "delivery_postal_code_verified", "customer_verified",
        "fulfillment_deadline_at", "created_at"
      ) VALUES (
        ${tenantId}::uuid, ${storeId}::uuid, ${customerId}::uuid, 'received', ${paymentMethod}::"PaymentMethod", 'aguardando_confirmacao', 'not_applicable',
        ${fulfillmentType}::"FulfillmentType",
        ${changeForCents},
        ${revalidated.subtotalCents}, ${revalidated.deliveryFeeCents}, ${revalidated.totalCents},
        ${discountCents}, ${couponId}::uuid, ${couponCodeSnapshot},
        ${deliveryAddressId}::uuid, ${address?.label ?? null}, ${address?.street ?? null}, ${address?.number ?? null}, ${address?.complement ?? null},
        ${address?.neighborhood ?? null}, ${address?.city ?? null}, ${address?.state ?? null}, ${address?.postalCode ?? null}, ${address?.referencePoint ?? null},
        ${pontoOuNulo(address)}, ${address?.postalCodeVerified ?? true}, ${customerVerified},
        ${fulfillmentDeadlineAt}, ${createdAt}
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
