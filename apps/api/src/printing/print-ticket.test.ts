import { describe, expect, it } from 'vitest';
import { buildCounterTicket, buildKitchenTicket, formatOrderNumber, type PrintTicketOrder } from './print-ticket';

const ORDER: PrintTicketOrder = {
  id: '018f3f6b-7d1a-7000-9000-000000000123',
  orderNumber: 42,
  createdAt: new Date('2026-08-13T22:42:00.000Z'),
  fulfillmentType: 'delivery',
  fulfillmentDeadlineAt: new Date('2026-08-13T23:30:00.000Z'),
  scheduledFor: null,
  paymentMethod: 'cash_on_delivery',
  changeForCents: 5000,
  subtotalCents: 4200,
  deliveryFeeCents: 800,
  discountCents: 500,
  totalCents: 4500,
  currentTotalCents: null,
  notes: 'tocar a campainha',
  customer: { name: 'Maria Silva' },
  store: { timezone: 'America/Sao_Paulo' },
  delivery: {
    label: 'Casa',
    street: 'Rua das Flores',
    number: '123',
    complement: 'Apto 4',
    neighborhood: 'Centro',
    city: 'Sao Paulo',
    state: 'SP',
    postalCode: '01000-000',
    referencePoint: 'proximo ao mercado',
  },
  items: [
    { name: 'X-Burger', quantity: 2, lineTotalCents: 3000, notes: 'sem cebola', modifiers: [{ name: 'Bacon' }] },
    { name: 'Batata media', quantity: 1, lineTotalCents: 1200, notes: null, modifiers: [] },
  ],
};

describe('formatOrderNumber', () => {
  it('padStart 5, cresce depois; null → #s/n', () => {
    expect(formatOrderNumber(1)).toBe('#00001');
    expect(formatOrderNumber(42)).toBe('#00042');
    expect(formatOrderNumber(123456)).toBe('#123456');
    expect(formatOrderNumber(null)).toBe('#s/n');
  });
});

describe('buildCounterTicket (VIA BALCAO)', () => {
  const t = buildCounterTicket(ORDER);

  it('tem número, tipo, prazo, nome e endereço completo', () => {
    expect(t).toContain('VIA BALCAO');
    expect(t).toContain('PEDIDO #00042');
    expect(t).toContain('ENTREGA');
    expect(t).toContain('Prazo:');
    expect(t).toContain('Cliente: Maria Silva');
    expect(t).toContain('Rua das Flores, 123');
    expect(t).toContain('Apto 4');
    expect(t).toContain('CEP 01000-000');
    expect(t).toContain('Ref: proximo ao mercado');
  });

  it('tem valor por item, totais, desconto, taxa e pagamento', () => {
    expect(t).toContain('2x X-Burger');
    expect(t).toContain('R$ 30,00');
    expect(t).toContain('Subtotal');
    expect(t).toContain('Desconto');
    expect(t).toContain('-R$ 5,00');
    expect(t).toContain('Taxa de entrega');
    expect(t).toContain('TOTAL');
    expect(t).toContain('R$ 45,00');
    expect(t).toContain('Pagamento: Dinheiro na entrega');
    expect(t).toContain('Troco para R$ 50,00');
    expect(t).toContain('Obs: tocar a campainha');
  });

  it('usa currentTotalCents quando há ajuste de balcão', () => {
    expect(buildCounterTicket({ ...ORDER, currentTotalCents: 5000 })).toContain('R$ 50,00');
  });

  it('retirada: sem endereço, sem taxa de entrega', () => {
    const p = buildCounterTicket({ ...ORDER, fulfillmentType: 'pickup', delivery: null });
    expect(p).toContain('RETIRADA');
    expect(p).not.toContain('Rua das Flores');
    expect(p).not.toContain('Taxa de entrega');
  });
});

describe('buildKitchenTicket (VIA COZINHA)', () => {
  const t = buildKitchenTicket(ORDER);

  it('tem número, nome, tipo, prazo, itens e adicionais', () => {
    expect(t).toContain('VIA COZINHA');
    expect(t).toContain('PEDIDO #00042');
    expect(t).toContain('Cliente: Maria Silva');
    expect(t).toContain('ENTREGA');
    expect(t).toContain('Prazo:');
    expect(t).toContain('2x X-Burger');
    expect(t).toContain('  + Bacon');
    expect(t).toContain('  Obs: sem cebola');
    expect(t).toContain('Obs: tocar a campainha');
  });

  it('NUNCA tem preço, endereço ou CEP', () => {
    expect(t).not.toContain('R$');
    expect(t).not.toContain('Rua das Flores');
    expect(t).not.toContain('CEP');
    expect(t).not.toContain('Pagamento');
  });
});
