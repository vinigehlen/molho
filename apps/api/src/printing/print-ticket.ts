export interface PrintTicketItem {
  name: string;
  quantity: number;
  /** Total da linha (unitário × qtd + adicionais), em centavos. */
  lineTotalCents: number;
  notes: string | null;
  modifiers: { name: string }[];
}

export interface PrintTicketDelivery {
  label: string | null;
  street: string | null;
  number: string | null;
  complement: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
  postalCode: string | null;
  referencePoint: string | null;
}

export type PrintTicketPaymentMethod =
  | 'pix'
  | 'cash_on_delivery'
  | 'card_on_delivery'
  | 'cash_at_counter'
  | 'card_at_counter';

export interface PrintTicketOrder {
  id: string;
  orderNumber: number | null;
  createdAt: Date;
  fulfillmentType: 'delivery' | 'pickup';
  /** Prazo prometido (delivery: ETA da zona; pickup: +30min). */
  fulfillmentDeadlineAt: Date | null;
  /** Agendamento escolhido pelo cliente; `null` = "o quanto antes". */
  scheduledFor: Date | null;
  paymentMethod: PrintTicketPaymentMethod;
  /** "Troco pra quanto" (só cash_on_delivery). */
  changeForCents: number | null;
  subtotalCents: number;
  deliveryFeeCents: number;
  discountCents: number;
  totalCents: number;
  /** Total após ajustes do balcão; `null` = nunca ajustado (usa totalCents). */
  currentTotalCents: number | null;
  notes: string | null;
  customer: { name: string };
  store: { timezone: string };
  delivery: PrintTicketDelivery | null;
  items: PrintTicketItem[];
}

const WIDTH = 42;
const RULE = '-'.repeat(WIDTH);

/** "#00042" — 5 dígitos, cresce depois disso. `null` (legado) → "#s/n". */
export function formatOrderNumber(orderNumber: number | null): string {
  return orderNumber == null ? '#s/n' : `#${String(orderNumber).padStart(5, '0')}`;
}

function money(cents: number): string {
  const negative = cents < 0;
  const digits = Math.abs(Math.trunc(cents)).toString().padStart(3, '0');
  const int = digits.slice(0, -2).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `${negative ? '-' : ''}R$ ${int},${digits.slice(-2)}`;
}

function shortDateTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function shortTime(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

const FULFILLMENT_LABEL: Record<PrintTicketOrder['fulfillmentType'], string> = {
  delivery: 'ENTREGA',
  pickup: 'RETIRADA',
};

const PAYMENT_LABEL: Record<PrintTicketPaymentMethod, string> = {
  pix: 'PIX',
  cash_on_delivery: 'Dinheiro na entrega',
  card_on_delivery: 'Cartao na entrega',
  cash_at_counter: 'Dinheiro no balcao',
  card_at_counter: 'Cartao no balcao',
};

/** "1x KIT PICANHA" à esquerda, valor à direita; quebra se não couber. */
function itemLine(item: PrintTicketItem, withPrice: boolean): string[] {
  const lines: string[] = [];
  const left = `${item.quantity}x ${item.name}`;
  if (!withPrice) {
    lines.push(left);
  } else {
    const price = money(item.lineTotalCents);
    if (left.length + 1 + price.length <= WIDTH) {
      lines.push(left + ' '.repeat(WIDTH - left.length - price.length) + price);
    } else {
      lines.push(left);
      lines.push(' '.repeat(Math.max(0, WIDTH - price.length)) + price);
    }
  }
  for (const modifier of item.modifiers) {
    lines.push(`  + ${modifier.name}`);
  }
  if (item.notes) {
    lines.push(`  Obs: ${item.notes}`);
  }
  return lines;
}

function totalLine(label: string, value: string): string {
  return label + ' '.repeat(Math.max(1, WIDTH - label.length - value.length)) + value;
}

function deadlineLines(order: PrintTicketOrder): string[] {
  const lines: string[] = [];
  if (order.scheduledFor) {
    lines.push(`Agendado p/ ${shortTime(order.scheduledFor, order.store.timezone)}`);
  }
  if (order.fulfillmentDeadlineAt) {
    lines.push(`Prazo: ${shortTime(order.fulfillmentDeadlineAt, order.store.timezone)}`);
  }
  return lines;
}

function addressLines(delivery: PrintTicketDelivery): string[] {
  const lines: string[] = [];
  const streetParts = [delivery.street, delivery.number].filter(Boolean).join(', ');
  if (streetParts) lines.push(streetParts);
  if (delivery.complement) lines.push(delivery.complement);
  const region = [delivery.neighborhood, [delivery.city, delivery.state].filter(Boolean).join('/')]
    .filter(Boolean)
    .join(' - ');
  if (region) lines.push(region);
  if (delivery.postalCode) lines.push(`CEP ${delivery.postalCode}`);
  if (delivery.referencePoint) lines.push(`Ref: ${delivery.referencePoint}`);
  return lines;
}

/**
 * VIA BALCÃO — conferência antes de despachar. Tudo: nome, endereço, itens com
 * valor, totais, forma de pagamento, prazos, observação.
 */
export function buildCounterTicket(order: PrintTicketOrder): string {
  const total = order.currentTotalCents ?? order.totalCents;
  const lines: string[] = [
    'VIA BALCAO',
    `PEDIDO ${formatOrderNumber(order.orderNumber)}`,
    shortDateTime(order.createdAt, order.store.timezone),
    FULFILLMENT_LABEL[order.fulfillmentType],
    ...deadlineLines(order),
    RULE,
    `Cliente: ${order.customer.name}`,
  ];

  if (order.fulfillmentType === 'delivery' && order.delivery) {
    lines.push(...addressLines(order.delivery));
  }

  lines.push(RULE);
  for (const item of order.items) {
    lines.push(...itemLine(item, true));
  }

  lines.push(RULE);
  lines.push(totalLine('Subtotal', money(order.subtotalCents)));
  if (order.discountCents > 0) {
    lines.push(totalLine('Desconto', money(-order.discountCents)));
  }
  if (order.fulfillmentType === 'delivery') {
    lines.push(totalLine('Taxa de entrega', money(order.deliveryFeeCents)));
  }
  lines.push(totalLine('TOTAL', money(total)));

  lines.push(RULE);
  lines.push(`Pagamento: ${PAYMENT_LABEL[order.paymentMethod]}`);
  if (order.paymentMethod === 'cash_on_delivery' && order.changeForCents != null) {
    lines.push(`Troco para ${money(order.changeForCents)}`);
  }

  if (order.notes) {
    lines.push(RULE);
    lines.push(`Obs: ${order.notes}`);
  }

  return lines.join('\n').trimEnd();
}

/**
 * VIA COZINHA — só o que a cozinha precisa: número, nome, tipo, prazo, itens
 * com quantidade e adicionais, observação. SEM preço, SEM endereço, SEM telefone.
 */
export function buildKitchenTicket(order: PrintTicketOrder): string {
  const lines: string[] = [
    'VIA COZINHA',
    `PEDIDO ${formatOrderNumber(order.orderNumber)}`,
    `Cliente: ${order.customer.name}`,
    FULFILLMENT_LABEL[order.fulfillmentType],
    ...deadlineLines(order),
    RULE,
  ];

  for (const item of order.items) {
    lines.push(...itemLine(item, false));
  }

  if (order.notes) {
    lines.push(RULE);
    lines.push(`Obs: ${order.notes}`);
  }

  return lines.join('\n').trimEnd();
}
