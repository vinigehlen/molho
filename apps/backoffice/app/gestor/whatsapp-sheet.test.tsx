import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminOrder } from '@molho/contracts';
import { WhatsAppSheet } from './whatsapp-sheet';
import { fetchCustomerPhone, registerOrderNotification } from '../../lib/orders-api';

vi.mock('../../lib/orders-api', () => ({
  fetchCustomerPhone: vi.fn(),
  registerOrderNotification: vi.fn(),
}));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const ORDER: AdminOrder = {
  id: '018f3c2a-0000-7000-8000-000000000003',
  status: 'ready',
  version: 0,
  createdAt: '2026-09-02T22:00:00.000Z',
  fulfillmentDeadlineAt: null,
  customerName: 'Ana Souza',
  customerVerified: true,
  paymentMethod: 'pix',
  paymentStatus: 'confirmado',
  changeForCents: null,
  subtotalCents: 4290,
  deliveryFeeCents: 0,
  totalCents: 4290,
  currentTotalCents: null,
  fulfillmentType: 'delivery',
  destination: 'delivery',
  delivery: null,
  items: [{ name: 'X-Burger', quantity: 1, lineTotalCents: 4290, modifiers: [], notes: null }],
  flaggedAt: null,
  flaggedReason: null,
  lastNotifiedAt: null,
  notificationCount: 0,
};

let container: HTMLDivElement;
let root: Root;

async function render(props: Partial<React.ComponentProps<typeof WhatsAppSheet>> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => {
    root.render(<WhatsAppSheet order={ORDER} onClose={vi.fn()} onNotified={vi.fn()} {...props} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
});

describe('WhatsAppSheet', () => {
  it('abre o wa.me e registra notification_log sem trafegar telefone no AdminOrder', async () => {
    vi.mocked(fetchCustomerPhone).mockResolvedValue('5551999990000');
    vi.mocked(registerOrderNotification).mockResolvedValue({
      id: '018f3c2a-0000-7000-8000-000000000001',
      orderId: ORDER.id,
      channel: 'whatsapp_ctc',
      orderStatusSnapshot: 'ready',
      createdAt: '2026-09-02T22:30:00.000Z',
    });
    const open = vi.spyOn(window, 'open').mockImplementation(() => null);
    const onNotified = vi.fn();
    const onClose = vi.fn();

    await render({ onNotified, onClose });

    const button = [...document.body.querySelectorAll('button')].find((item) => item.textContent?.includes('Abrir WhatsApp'));
    expect(button).toBeTruthy();
    act(() => {
      button?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    await act(async () => {
      await Promise.resolve();
    });

    expect(open).toHaveBeenCalledWith(expect.stringContaining('https://wa.me/5551999990000?text='), '_blank', 'noopener,noreferrer');
    expect(registerOrderNotification).toHaveBeenCalledWith(ORDER.id);
    expect(onNotified).toHaveBeenCalledWith({
      id: '018f3c2a-0000-7000-8000-000000000001',
      orderId: ORDER.id,
      channel: 'whatsapp_ctc',
      orderStatusSnapshot: 'ready',
      createdAt: '2026-09-02T22:30:00.000Z',
    });
    expect(onClose).toHaveBeenCalledOnce();
  });
});
