import { ACTIVE_ORDER_STATUSES, type AdminOrder } from '@molho/contracts';
import { decryptPhone } from '@molho/db';
import type { RequestContextService } from '../context/request-context.service';

/** Campos selecionados do Order (flat) + join magro com Customer/items. Espelha o `select` abaixo. */
export interface AdminOrderRow {
  id: string;
  status: AdminOrder['status'];
  version: number;
  createdAt: Date;
  fulfillmentDeadlineAt: Date | null;
  paymentMethod: AdminOrder['paymentMethod'];
  paymentStatus: AdminOrder['paymentStatus'];
  customerVerified: boolean;
  changeForCents: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  fulfillmentType: AdminOrder['fulfillmentType'];
  /** Nulos juntos ⟺ pickup — CHECK do banco garante que `delivery` nunca tem só alguns. */
  deliveryLabel: string | null;
  deliveryStreet: string | null;
  deliveryNumber: string | null;
  deliveryComplement: string | null;
  deliveryNeighborhood: string | null;
  deliveryCity: string | null;
  deliveryState: string | null;
  deliveryPostalCode: string | null;
  deliveryReferencePoint: string | null;
  deliveryPostalCodeVerified: boolean;
  customer: { name: string };
  items: {
    name: string;
    quantity: number;
    lineTotalCents: number;
    notes: string | null;
    modifiers: { name: string }[];
  }[];
}

/** Row do Prisma → shape do contrato. Puro: achata o endereço-snapshot, puxa o nome do JOIN, Date → ISO. */
export function toAdminOrder(row: AdminOrderRow): AdminOrder {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    fulfillmentDeadlineAt: row.fulfillmentDeadlineAt?.toISOString() ?? null,
    customerName: row.customer.name,
    customerVerified: row.customerVerified,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    changeForCents: row.changeForCents,
    subtotalCents: row.subtotalCents,
    deliveryFeeCents: row.deliveryFeeCents,
    totalCents: row.totalCents,
    fulfillmentType: row.fulfillmentType,
    delivery:
      row.fulfillmentType === 'pickup' || row.deliveryLabel === null
        ? null
        : {
            label: row.deliveryLabel,
            street: row.deliveryStreet ?? '',
            number: row.deliveryNumber,
            complement: row.deliveryComplement,
            neighborhood: row.deliveryNeighborhood ?? '',
            city: row.deliveryCity ?? '',
            state: row.deliveryState ?? '',
            postalCode: row.deliveryPostalCode,
            referencePoint: row.deliveryReferencePoint,
            postalCodeVerified: row.deliveryPostalCodeVerified,
          },
    items: row.items.map((i) => ({
      name: i.name,
      quantity: i.quantity,
      lineTotalCents: i.lineTotalCents,
      notes: i.notes,
      modifiers: i.modifiers.map((m) => ({ name: m.name })),
    })),
  };
}

const SELECT = {
  id: true,
  status: true,
  version: true,
  createdAt: true,
  fulfillmentDeadlineAt: true,
  paymentMethod: true,
  paymentStatus: true,
  customerVerified: true,
  changeForCents: true,
  subtotalCents: true,
  deliveryFeeCents: true,
  totalCents: true,
  fulfillmentType: true,
  deliveryLabel: true,
  deliveryStreet: true,
  deliveryNumber: true,
  deliveryComplement: true,
  deliveryNeighborhood: true,
  deliveryCity: true,
  deliveryState: true,
  deliveryPostalCode: true,
  deliveryReferencePoint: true,
  deliveryPostalCodeVerified: true,
  customer: { select: { name: true } },
  items: {
    select: {
      name: true,
      quantity: true,
      lineTotalCents: true,
      notes: true,
      modifiers: { select: { name: true } },
    },
  },
} as const;

export interface AdminOrderRepository {
  /** Pedidos ATIVOS (não-terminais) do tenant, mais antigos primeiro (FIFO da cozinha). RLS filtra o tenant. */
  listActive(): Promise<AdminOrder[]>;
  findById(orderId: string): Promise<AdminOrder | null>;
  /** Telefone do cliente em DÍGITOS com DDI, sem "+" — o formato que o `wa.me` aceite. `null` se o pedido não existe (ou é de outro tenant). */
  findCustomerPhoneForChat(orderId: string): Promise<string | null>;
}

/**
 * tenant_id nunca é parâmetro: RLS (app_tenant_visible) filtra toda leitura
 * pelo GUC da transação do RequestContextService. Mesma regra dos outros
 * repositórios de request path.
 */
export class PrismaAdminOrderRepository implements AdminOrderRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listActive(): Promise<AdminOrder[]> {
    const rows = await this.requestContext.getClient().order.findMany({
      where: { status: { in: [...ACTIVE_ORDER_STATUSES] }, deletedAt: null },
      orderBy: { createdAt: 'asc' },
      select: SELECT,
    });
    return rows.map(toAdminOrder);
  }

  async findById(orderId: string): Promise<AdminOrder | null> {
    const row = await this.requestContext.getClient().order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: SELECT,
    });
    return row ? toAdminOrder(row) : null;
  }

  /**
   * Click-to-chat (Épico 11). A decifragem acontece DEPOIS da leitura, então a
   * RLS decide primeiro: pedido de outro tenant nem aparece no `findFirst` e
   * sai daqui como `null` (404 no controller) sem nunca virar texto em claro.
   * A chave (`MOLHO_ENCRYPTION_KEYS`) só existe neste processo — nunca no
   * Postgres, nunca no browser. Por isso o telefone NÃO entra no `AdminOrder`:
   * o board carrega dezenas de pedidos e não precisa de nenhum telefone; esta
   * rota entrega UM, quando o lojista clica.
   *
   * Guest (Épico 9c) não tem caminho especial: `orders.customer_id` é NOT NULL
   * e o `findOrCreate` do checkout guest cifra o telefone igual ao verificado —
   * só não carimba `phone_verified_at`.
   */
  async findCustomerPhoneForChat(orderId: string): Promise<string | null> {
    const row = await this.requestContext.getClient().order.findFirst({
      where: { id: orderId, deletedAt: null },
      select: { customer: { select: { phoneCiphertext: true, phoneKeyVersion: true } } },
    });
    if (!row) return null;
    // Cliente anônimo de balcão (Épico balcão) não tem telefone nenhum — nada
    // pra chamar no WhatsApp, mesmo 404 do controller que "pedido não existe".
    if (!row.customer.phoneCiphertext) return null;
    const e164 = decryptPhone(Buffer.from(row.customer.phoneCiphertext), row.customer.phoneKeyVersion);
    return e164.replace(/\D/g, ''); // "+5551992616964" → "5551992616964" (o wa.me recusa o "+")
  }
}
