import type { AdminOrder } from '@molho/contracts';
import { describe, expect, it } from 'vitest';
import { BOARD_COLUMNS, groupByColumn } from './orders-api';

function order(id: string, status: AdminOrder['status']): AdminOrder {
  return {
    id,
    status,
    version: 0,
    createdAt: '2026-07-26T18:00:00.000Z',
    fulfillmentDeadlineAt: null,
    customerName: 'X',
    customerVerified: true,
    paymentMethod: 'pix',
    paymentStatus: 'confirmado',
    changeForCents: null,
    subtotalCents: 100,
    deliveryFeeCents: 0,
    totalCents: 100,
    fulfillmentType: 'delivery',
    delivery: {
      label: 'Casa',
      street: 'R',
      number: null,
      complement: null,
      neighborhood: 'B',
      city: 'C',
      state: 'RS',
      postalCode: null,
      referencePoint: null,
      postalCodeVerified: false,
    },
    items: [],
  };
}

describe('groupByColumn', () => {
  it('agrupa por status ativo, preservando ordem de chegada (FIFO)', () => {
    const groups = groupByColumn([
      order('a', 'received'),
      order('b', 'preparing'),
      order('c', 'received'),
    ]);
    expect(groups.received.map((o) => o.id)).toEqual(['a', 'c']);
    expect(groups.preparing.map((o) => o.id)).toEqual(['b']);
    expect(groups.ready).toEqual([]);
  });

  it('ignora status terminal que não é coluna do board (ex.: completed)', () => {
    const groups = groupByColumn([order('a', 'completed'), order('b', 'ready')]);
    expect(groups.ready.map((o) => o.id)).toEqual(['b']);
    expect(Object.values(groups).flat()).toHaveLength(1);
  });

  it('BOARD_COLUMNS são os 4 ativos na ordem do fluxo', () => {
    expect(BOARD_COLUMNS).toEqual(['received', 'preparing', 'ready', 'in_transit']);
  });
});
