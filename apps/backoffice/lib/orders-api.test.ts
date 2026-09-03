import type { AdminOrder } from '@molho/contracts';
import { describe, expect, it, vi } from 'vitest';
import { apiFetch } from './api-client';
import { BOARD_COLUMNS, groupByColumn, registerOrderNotification } from './orders-api';

vi.mock('./api-client', () => ({ apiFetch: vi.fn() }));

function order(id: string, status: AdminOrder['status']): AdminOrder {
  return {
    id,
    status,
    version: 0,
    createdAt: '2026-07-26T18:00:00.000Z',
    fulfillmentDeadlineAt: null,
    flaggedAt: null,
    flaggedReason: null,
    lastNotifiedAt: null,
    notificationCount: 0,
    customerName: 'X',
    customerVerified: true,
    paymentMethod: 'pix',
    paymentStatus: 'confirmado',
    changeForCents: null,
    subtotalCents: 100,
    deliveryFeeCents: 0,
    totalCents: 100,
    currentTotalCents: null,
    fulfillmentType: 'delivery',
    destination: 'delivery',
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

  it('inclui completed na coluna de finalizados', () => {
    const groups = groupByColumn([order('a', 'completed'), order('b', 'ready')]);
    expect(groups.completed.map((o) => o.id)).toEqual(['a']);
    expect(groups.ready.map((o) => o.id)).toEqual(['b']);
    expect(Object.values(groups).flat()).toHaveLength(2);
  });

  it('BOARD_COLUMNS colocam finalizados ao lado de saíram', () => {
    expect(BOARD_COLUMNS).toEqual(['received', 'preparing', 'ready', 'in_transit', 'completed']);
  });
});

describe('registerOrderNotification', () => {
  it('POSTa no endpoint de notification_log e devolve o recibo', async () => {
    vi.mocked(apiFetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          id: '018f3c2a-0000-7000-8000-000000000001',
          orderId: '018f3c2a-0000-7000-8000-000000000002',
          channel: 'whatsapp_ctc',
          orderStatusSnapshot: 'ready',
          createdAt: '2026-09-02T22:30:00.000Z',
        }),
        { status: 201 },
      ),
    );

    await expect(registerOrderNotification('018f3c2a-0000-7000-8000-000000000002')).resolves.toMatchObject({
      channel: 'whatsapp_ctc',
      orderStatusSnapshot: 'ready',
    });
    expect(apiFetch).toHaveBeenCalledWith('/v1/admin/orders/018f3c2a-0000-7000-8000-000000000002/notifications', { method: 'POST' });
  });

  it('403/404 viram null para módulo desligado ou pedido invisível', async () => {
    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 403 }));
    await expect(registerOrderNotification('order-1')).resolves.toBeNull();

    vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status: 404 }));
    await expect(registerOrderNotification('order-1')).resolves.toBeNull();
  });
});
