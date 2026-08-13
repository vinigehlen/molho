import type { AdminOrder } from '@molho/contracts';
import { describe, expect, it } from 'vitest';
import { applyOrderUpdate } from './order-updates';

function order(id: string, status: AdminOrder['status'], version = 0): AdminOrder {
  return {
    id,
    status,
    version,
    createdAt: '2026-07-26T18:00:00.000Z',
    customerName: 'X',
    customerVerified: true,
    paymentMethod: 'pix',
    paymentStatus: 'confirmado',
    changeForCents: null,
    subtotalCents: 100,
    deliveryFeeCents: 0,
    totalCents: 100,
    fulfillmentType: 'delivery',
    delivery: { label: 'C', street: 'R', number: null, complement: null, neighborhood: 'B', city: 'C', state: 'RS', postalCode: null, referencePoint: null, postalCodeVerified: false },
    items: [],
  };
}

describe('applyOrderUpdate', () => {
  it('pedido novo (não estava no board) entra no fim (FIFO)', () => {
    const next = applyOrderUpdate([order('a', 'received')], 'b', order('b', 'received'));
    expect(next.map((o) => o.id)).toEqual(['a', 'b']);
  });

  it('mudança de status faz upsert NA MESMA posição (não reordena)', () => {
    const next = applyOrderUpdate([order('a', 'received'), order('b', 'received')], 'a', order('a', 'preparing', 1));
    expect(next.map((o) => o.id)).toEqual(['a', 'b']);
    expect(next[0]?.status).toBe('preparing');
    expect(next[0]?.version).toBe(1);
  });

  it('pedido que saiu dos ativos (completed) é removido do board', () => {
    const next = applyOrderUpdate([order('a', 'in_transit'), order('b', 'received')], 'a', order('a', 'completed'));
    expect(next.map((o) => o.id)).toEqual(['b']);
  });

  it('fetch null (sumiu/RLS) remove do board', () => {
    const next = applyOrderUpdate([order('a', 'received')], 'a', null);
    expect(next).toEqual([]);
  });

  it('cancelado é removido (status terminal)', () => {
    const next = applyOrderUpdate([order('a', 'preparing')], 'a', order('a', 'canceled'));
    expect(next).toEqual([]);
  });
});
