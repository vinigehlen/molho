import { encryptPhone, hashPhoneForLookup } from '../../src/crypto/phone';
import { Prisma } from '../generated/client/client';
import type { PrismaClient } from '../generated/client/client';

/**
 * Pedidos de exemplo pro board do gestor (Épico 9) ter o que renderizar sem
 * depender de fechar pedido na mão. Cobre o que precisa ser exercitado em
 * navegador: os 3 métodos de pagamento, um PIX NÃO confirmado (pra ver o gate
 * §5.5 barrar o preparo), cash_on_delivery com e sem troco, e pedidos
 * espalhados pelas 4 colunas (received/preparing/ready/in_transit).
 *
 * Idempotente por UUID fixo: se o pedido já existe, pula (order_items são
 * append-only, mas como o seed roda como app_migrator ele poderia apagar — o
 * skip evita duplicar sem precisar disso). Sem order_status_history: o board
 * não a lê (é a timeline do Épico 12), e não há FK exigindo.
 */
interface SeedOrderItem {
  name: string;
  unitBasePriceCents: number;
  quantity: number;
}
interface SeedOrderDef {
  id: string;
  customerName: string;
  customerPhone: string; // E.164
  status: 'received' | 'preparing' | 'ready' | 'in_transit';
  paymentMethod: 'pix' | 'cash_on_delivery' | 'card_on_delivery';
  paymentStatus: 'aguardando_confirmacao' | 'confirmado';
  changeForCents: number | null;
  deliveryFeeCents: number;
  /** `pickup` = sem endereço nenhum (retira no balcão). Default `delivery` — só o pedido G é pickup, pro board mostrar os dois. */
  fulfillmentType?: 'delivery' | 'pickup';
  items: SeedOrderItem[];
}

const SEED_ORDERS: SeedOrderDef[] = [
  {
    id: '018f0000-0000-7000-8000-0000000000a1',
    customerName: 'Ana Souza',
    customerPhone: '+5551988880001',
    status: 'received',
    paymentMethod: 'pix',
    paymentStatus: 'aguardando_confirmacao', // PIX não confirmado → gate barra o preparo
    changeForCents: null,
    deliveryFeeCents: 500,
    items: [{ name: 'X-Salada', unitBasePriceCents: 2800, quantity: 1 }],
  },
  {
    id: '018f0000-0000-7000-8000-0000000000a2',
    customerName: 'Bruno Lima',
    customerPhone: '+5551988880002',
    status: 'preparing',
    paymentMethod: 'pix',
    paymentStatus: 'confirmado',
    changeForCents: null,
    deliveryFeeCents: 500,
    items: [{ name: 'X-Bacon', unitBasePriceCents: 3200, quantity: 2 }],
  },
  {
    id: '018f0000-0000-7000-8000-0000000000a3',
    customerName: 'Carla Dias',
    customerPhone: '+5551988880003',
    status: 'received',
    paymentMethod: 'cash_on_delivery',
    paymentStatus: 'aguardando_confirmacao',
    changeForCents: 5000, // troco pra R$ 50
    deliveryFeeCents: 700,
    items: [{ name: 'Combo Duplo', unitBasePriceCents: 4300, quantity: 1 }],
  },
  {
    id: '018f0000-0000-7000-8000-0000000000a4',
    customerName: 'Diego Alves',
    customerPhone: '+5551988880004',
    status: 'ready',
    paymentMethod: 'cash_on_delivery',
    paymentStatus: 'aguardando_confirmacao',
    changeForCents: null, // sem troco
    deliveryFeeCents: 500,
    items: [{ name: 'X-Egg', unitBasePriceCents: 2600, quantity: 1 }],
  },
  {
    id: '018f0000-0000-7000-8000-0000000000a5',
    customerName: 'Elena Rocha',
    customerPhone: '+5551988880005',
    status: 'in_transit',
    paymentMethod: 'card_on_delivery',
    paymentStatus: 'aguardando_confirmacao',
    changeForCents: null,
    deliveryFeeCents: 600,
    items: [{ name: 'Smash Duplo', unitBasePriceCents: 3900, quantity: 1 }],
  },
  {
    id: '018f0000-0000-7000-8000-0000000000a6',
    customerName: 'Fernando Melo',
    customerPhone: '+5551988880006',
    status: 'ready',
    paymentMethod: 'pix',
    paymentStatus: 'confirmado',
    changeForCents: null,
    deliveryFeeCents: 500,
    items: [{ name: 'X-Tudo', unitBasePriceCents: 3500, quantity: 1 }],
  },
  {
    id: '018f0000-0000-7000-8000-0000000000a7',
    customerName: 'Gustavo Prado',
    customerPhone: '+5551988880007',
    status: 'received',
    paymentMethod: 'pix',
    paymentStatus: 'confirmado',
    changeForCents: null,
    deliveryFeeCents: 0, // pickup nunca tem taxa
    fulfillmentType: 'pickup',
    items: [{ name: 'X-Salada', unitBasePriceCents: 2800, quantity: 1 }],
  },
];

// Ponto de entrega (snapshot) — perto de Porto Alegre, dentro da zona seed.
const DELIVERY = { lng: -51.23, lat: -30.03 };

async function findOrCreateCustomer(prisma: PrismaClient, tenantId: string, name: string, phone: string): Promise<string> {
  const phoneLookupHash = hashPhoneForLookup(phone);
  const existing = await prisma.customer.findFirst({ where: { tenantId, phoneLookupHash, deletedAt: null }, select: { id: true } });
  if (existing) return existing.id;
  const { ciphertext, keyVersion } = encryptPhone(phone);
  const created = await prisma.customer.create({
    // Prisma (Bytes) quer Uint8Array<ArrayBuffer>; Buffer é ArrayBufferLike — envolve (mesmo do owner em index.ts).
    data: { tenantId, name, phoneCiphertext: new Uint8Array(ciphertext), phoneLookupHash, phoneKeyVersion: keyVersion },
    select: { id: true },
  });
  return created.id;
}

export async function seedOrders(prisma: PrismaClient, tenantId: string, storeId: string): Promise<void> {
  const product = await prisma.product.findFirst({ where: { tenantId, deletedAt: null }, select: { id: true }, orderBy: { createdAt: 'asc' } });
  if (!product) throw new Error('nenhum produto no tenant — seed de catálogo rodou?');

  for (const def of SEED_ORDERS) {
    const exists = await prisma.order.findUnique({ where: { id: def.id }, select: { id: true } });
    if (exists) {
      console.log(`  pedido ${def.customerName} já existia`);
      continue;
    }

    const customerId = await findOrCreateCustomer(prisma, tenantId, def.customerName, def.customerPhone);
    const subtotalCents = def.items.reduce((sum, i) => sum + i.unitBasePriceCents * i.quantity, 0);
    const totalCents = subtotalCents + def.deliveryFeeCents;
    const fulfillmentType = def.fulfillmentType ?? 'delivery';
    // Pickup não tem endereço nenhum (CHECK da migration só exige nos 5 campos
    // quando fulfillment_type = 'delivery').
    const address =
      fulfillmentType === 'pickup'
        ? { label: null, street: null, number: null, neighborhood: null, city: null, state: null, postalCode: null, referencePoint: null }
        : {
            label: 'Casa',
            street: 'Rua das Flores',
            number: '123',
            neighborhood: 'Centro',
            city: 'Porto Alegre',
            state: 'RS',
            postalCode: '90000-000',
            referencePoint: 'Perto da praça',
          };
    // geo NULL é o normal em pickup — nada a ver com "ponto não achado" do
    // branch delivery sem lat/lng.
    const geo =
      fulfillmentType === 'pickup'
        ? Prisma.sql`NULL`
        : Prisma.sql`ST_SetSRID(ST_MakePoint(${DELIVERY.lng}, ${DELIVERY.lat}), 4326)::geography`;

    // delivery_geo é geography(Point) — Prisma omite Unsupported, então o
    // INSERT vai por raw (mesmo ST_MakePoint do checkout-order.repository).
    await prisma.$executeRaw`
      INSERT INTO "orders" (
        "id", "tenant_id", "store_id", "customer_id", "status", "payment_method", "payment_status", "refund_status",
        "fulfillment_type",
        "change_for_cents", "subtotal_cents", "delivery_fee_cents", "total_cents",
        "delivery_label", "delivery_street", "delivery_number", "delivery_complement",
        "delivery_neighborhood", "delivery_city", "delivery_state", "delivery_postal_code", "delivery_reference_point",
        "delivery_geo"
      ) VALUES (
        ${def.id}::uuid, ${tenantId}::uuid, ${storeId}::uuid, ${customerId}::uuid,
        ${def.status}::"OrderStatus", ${def.paymentMethod}::"PaymentMethod", ${def.paymentStatus}::"PaymentStatus", 'not_applicable',
        ${fulfillmentType}::"FulfillmentType",
        ${def.changeForCents}, ${subtotalCents}, ${def.deliveryFeeCents}, ${totalCents},
        ${address.label}, ${address.street}, ${address.number}, NULL,
        ${address.neighborhood}, ${address.city}, ${address.state}, ${address.postalCode}, ${address.referencePoint},
        ${geo}
      )
    `;

    for (const item of def.items) {
      await prisma.orderItem.create({
        data: {
          tenantId,
          orderId: def.id,
          productId: product.id,
          name: item.name,
          unitBasePriceCents: item.unitBasePriceCents,
          quantity: item.quantity,
          lineTotalCents: item.unitBasePriceCents * item.quantity,
        },
      });
    }
    console.log(`  pedido ${def.customerName} (${def.status}, ${def.paymentMethod})`);
  }
}
