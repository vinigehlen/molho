export interface PrintTicketOrder {
  id: string;
  createdAt: Date;
  fulfillmentType: 'delivery' | 'pickup';
  customer: { name: string };
  store: { timezone: string };
  items: {
    name: string;
    quantity: number;
    notes: string | null;
    modifiers: { name: string }[];
  }[];
}

function shortOrderId(orderId: string): string {
  return orderId.replace(/-/g, '').slice(0, 4).toUpperCase();
}

function formatOrderTime(createdAt: Date, timezone: string): string {
  return new Intl.DateTimeFormat('pt-BR', {
    timeZone: timezone,
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(createdAt);
}

/** Snapshot da comanda: sem preco, telefone, endereco ou qualquer PII alem do nome. */
export function buildKitchenTicket(order: PrintTicketOrder): string {
  const lines = [
    `PEDIDO #${shortOrderId(order.id)}`,
    formatOrderTime(order.createdAt, order.store.timezone),
    order.fulfillmentType === 'pickup' ? 'RETIRADA' : 'ENTREGA',
    `Cliente: ${order.customer.name}`,
    '',
  ];

  for (const item of order.items) {
    lines.push(`${item.quantity}x ${item.name}`);
    for (const modifier of item.modifiers) {
      lines.push(`  + ${modifier.name}`);
    }
    if (item.notes) {
      lines.push(`  Obs: ${item.notes}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

