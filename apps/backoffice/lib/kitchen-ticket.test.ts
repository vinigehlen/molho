import { describe, expect, it } from 'vitest';
import type { AdminOrder } from '@molho/contracts';
import { fulfillmentLabel, ticketNumber } from './kitchen-ticket';

const ORDER: AdminOrder = {
  id: '018f0000-0000-7000-8000-0000000000a1',
  status: 'received',
  version: 0,
  createdAt: '2026-08-10T18:30:00.000Z',
  customerName: 'Ana Souza',
  customerVerified: true,
  paymentMethod: 'pix',
  paymentStatus: 'aguardando_confirmacao',
  changeForCents: null,
  subtotalCents: 3200,
  deliveryFeeCents: 490,
  totalCents: 3690,
  fulfillmentType: 'delivery',
  delivery: {
    label: 'Casa',
    street: 'Rua das Flores',
    number: '123',
    complement: null,
    neighborhood: 'Centro',
    city: 'Porto Alegre',
    state: 'RS',
    postalCode: '90000-000',
    referencePoint: null,
    postalCodeVerified: true,
  },
  items: [{ name: 'X-Salada', quantity: 2, lineTotalCents: 3200, notes: 'sem cebola', modifiers: [{ name: 'Bacon' }] }],
};

describe('ticketNumber', () => {
  it('8 primeiros chars do id, maiúsculo', () => {
    expect(ticketNumber(ORDER)).toBe('018F0000');
  });
});

describe('fulfillmentLabel', () => {
  it('delivery: "Entrega"', () => {
    expect(fulfillmentLabel(ORDER)).toBe('Entrega');
  });

  it('pickup: "Retirada no balcão" — nunca o endereço da loja', () => {
    expect(fulfillmentLabel({ ...ORDER, fulfillmentType: 'pickup', delivery: null })).toBe('Retirada no balcão');
  });
});
