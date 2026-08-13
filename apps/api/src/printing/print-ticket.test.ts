import { describe, expect, it } from 'vitest';
import { buildKitchenTicket, type PrintTicketOrder } from './print-ticket';

const ORDER: PrintTicketOrder = {
  id: '018f3f6b-7d1a-7000-9000-000000000123',
  createdAt: new Date('2026-08-13T22:42:00.000Z'),
  fulfillmentType: 'delivery',
  customer: { name: 'Maria' },
  store: { timezone: 'America/Sao_Paulo' },
  items: [
    {
      name: 'X-Burger',
      quantity: 2,
      notes: 'sem cebola',
      modifiers: [{ name: 'Bacon' }, { name: 'Cheddar' }],
    },
    { name: 'Batata media', quantity: 1, notes: null, modifiers: [] },
  ],
};

describe('buildKitchenTicket', () => {
  it('monta comanda de entrega sem preco, telefone ou endereco', () => {
    const ticket = buildKitchenTicket(ORDER);

    expect(ticket).toContain('PEDIDO #018F');
    expect(ticket).toContain('ENTREGA');
    expect(ticket).toContain('Cliente: Maria');
    expect(ticket).toContain('2x X-Burger');
    expect(ticket).toContain('  + Bacon');
    expect(ticket).toContain('  Obs: sem cebola');
    expect(ticket).not.toContain('R$');
    expect(ticket).not.toContain('5551999999999');
    expect(ticket).not.toContain('Rua');
  });

  it('marca retirada sem imprimir endereco da loja', () => {
    const ticket = buildKitchenTicket({ ...ORDER, fulfillmentType: 'pickup' });

    expect(ticket).toContain('RETIRADA');
    expect(ticket).not.toContain('ENTREGA');
  });
});

