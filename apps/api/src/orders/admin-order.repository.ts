import { ACTIVE_ORDER_STATUSES, type AdminOrder } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';

/** Campos selecionados do Order (flat) + join magro com Customer/items. Espelha o `select` abaixo. */
export interface AdminOrderRow {
  id: string;
  status: AdminOrder['status'];
  version: number;
  createdAt: Date;
  paymentMethod: AdminOrder['paymentMethod'];
  paymentStatus: AdminOrder['paymentStatus'];
  changeForCents: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  totalCents: number;
  deliveryLabel: string;
  deliveryStreet: string;
  deliveryNumber: string | null;
  deliveryComplement: string | null;
  deliveryNeighborhood: string;
  deliveryCity: string;
  deliveryState: string;
  deliveryPostalCode: string | null;
  deliveryReferencePoint: string | null;
  customer: { name: string };
  items: { name: string; quantity: number; lineTotalCents: number }[];
}

/** Row do Prisma → shape do contrato. Puro: achata o endereço-snapshot, puxa o nome do JOIN, Date → ISO. */
export function toAdminOrder(row: AdminOrderRow): AdminOrder {
  return {
    id: row.id,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    customerName: row.customer.name,
    paymentMethod: row.paymentMethod,
    paymentStatus: row.paymentStatus,
    changeForCents: row.changeForCents,
    subtotalCents: row.subtotalCents,
    deliveryFeeCents: row.deliveryFeeCents,
    totalCents: row.totalCents,
    delivery: {
      label: row.deliveryLabel,
      street: row.deliveryStreet,
      number: row.deliveryNumber,
      complement: row.deliveryComplement,
      neighborhood: row.deliveryNeighborhood,
      city: row.deliveryCity,
      state: row.deliveryState,
      postalCode: row.deliveryPostalCode,
      referencePoint: row.deliveryReferencePoint,
    },
    items: row.items.map((i) => ({ name: i.name, quantity: i.quantity, lineTotalCents: i.lineTotalCents })),
  };
}

const SELECT = {
  id: true,
  status: true,
  version: true,
  createdAt: true,
  paymentMethod: true,
  paymentStatus: true,
  changeForCents: true,
  subtotalCents: true,
  deliveryFeeCents: true,
  totalCents: true,
  deliveryLabel: true,
  deliveryStreet: true,
  deliveryNumber: true,
  deliveryComplement: true,
  deliveryNeighborhood: true,
  deliveryCity: true,
  deliveryState: true,
  deliveryPostalCode: true,
  deliveryReferencePoint: true,
  customer: { select: { name: true } },
  items: { select: { name: true, quantity: true, lineTotalCents: true } },
} as const;

export interface AdminOrderRepository {
  /** Pedidos ATIVOS (não-terminais) do tenant, mais antigos primeiro (FIFO da cozinha). RLS filtra o tenant. */
  listActive(): Promise<AdminOrder[]>;
  findById(orderId: string): Promise<AdminOrder | null>;
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
}
