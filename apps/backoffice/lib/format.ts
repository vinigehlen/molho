/** Centavos (inteiro, CLAUDE.md regra 4) → "R$ 12,34". Nunca float — divide só na exibição. */
export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** Campo monetário pt-BR → centavos. Aceita tanto a saída de `centsToBRL`
 * (`R$ 1.234,56`) quanto ponto decimal digitado por teclados móveis. */
export function brlToCents(value: string): number {
  const clean = value.replace(/[^\d.,]/g, '');
  if (!clean) return 0;

  const commaIndex = clean.lastIndexOf(',');
  let normalized: string;
  if (commaIndex >= 0) {
    const integer = clean.slice(0, commaIndex).replace(/[.,]/g, '');
    const decimal = clean.slice(commaIndex + 1).replace(/[.,]/g, '');
    normalized = `${integer || '0'}.${decimal}`;
  } else {
    const dotCount = (clean.match(/\./g) ?? []).length;
    const decimalDigits = clean.length - clean.lastIndexOf('.') - 1;
    normalized = dotCount === 1 && decimalDigits <= 2 ? clean : clean.replace(/\./g, '');
  }

  return Math.max(0, Math.round(Number(normalized) * 100));
}

/** ISO → "18:42" (horário local) — o gestor pensa em "que horas entrou o pedido". */
export function isoToTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

/**
 * `severity` (Fase 2, plano do gestor — selo de prazo em 3 cores, padrão
 * iFood): 'ok' até a metade do tempo entre criação e prazo, 'warning' da
 * metade em diante, 'critical' quando já estourou. `createdAt` é opcional
 * só pra não quebrar quem já chamava com o shape antigo — sem ele, o selo
 * degrada pro binário de sempre (ok/critical, nunca warning).
 */
export function fulfillmentDeadline(
  order: { fulfillmentType: 'delivery' | 'pickup'; fulfillmentDeadlineAt: string | null; createdAt?: string },
  now: number,
): { text: string; overdue: boolean; severity: 'ok' | 'warning' | 'critical' } {
  const prefix = order.fulfillmentType === 'pickup' ? 'Retirar até' : 'Entregar até';
  if (!order.fulfillmentDeadlineAt) return { text: 'Prazo não registrado', overdue: false, severity: 'ok' };
  const deadlineMs = new Date(order.fulfillmentDeadlineAt).getTime();
  const overdue = deadlineMs < now;
  let severity: 'ok' | 'warning' | 'critical' = 'ok';
  if (overdue) {
    severity = 'critical';
  } else if (order.createdAt) {
    const createdMs = new Date(order.createdAt).getTime();
    const totalMs = deadlineMs - createdMs;
    const elapsedMs = now - createdMs;
    if (totalMs > 0 && elapsedMs >= totalMs / 2) severity = 'warning';
  }
  return {
    text: `${prefix}: ${new Date(deadlineMs).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`,
    overdue,
    severity,
  };
}
