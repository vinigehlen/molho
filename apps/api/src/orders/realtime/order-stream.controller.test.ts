import { type MessageEvent } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { InMemoryOrderEventBus } from './order-event-bus';
import { OrderStreamController } from './order-stream.controller';
import type { RequestWithUser } from '../../auth/guards/jwt-auth.guard';

/** Token com order.view no tenant-1 (exp bem no futuro, pra o expTimer não interferir). */
function req(): RequestWithUser {
  return {
    user: {
      sub: 'user-1',
      roles: ['owner'],
      scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }],
      tokenVersion: 0,
      deviceId: 'd1',
      jti: 'j1',
      exp: Math.floor(Date.now() / 1000) + 3600,
    },
    headers: {},
  } as unknown as RequestWithUser;
}

describe('OrderStreamController — graceful shutdown', () => {
  it('onApplicationShutdown fecha os streams abertos com server_shutdown + complete', async () => {
    const controller = new OrderStreamController(new InMemoryOrderEventBus());
    const events: MessageEvent[] = [];
    let completed = false;

    const obs = controller.stream('tenant-1', req());
    const sub = obs.subscribe({ next: (e) => events.push(e), complete: () => (completed = true) });

    controller.onApplicationShutdown();

    expect(events.some((e) => e.type === 'server_shutdown')).toBe(true);
    expect(completed).toBe(true);
    sub.unsubscribe();
  });

  it('stream já encerrado (teardown rodou) não é fechado de novo no shutdown', () => {
    const controller = new OrderStreamController(new InMemoryOrderEventBus());
    const obs = controller.stream('tenant-1', req());
    const sub = obs.subscribe();
    sub.unsubscribe(); // teardown remove do openStreams

    // não lança nem tenta fechar nada
    expect(() => controller.onApplicationShutdown()).not.toThrow();
  });
});

describe('OrderStreamController — mapeamento de evento pro SSE', () => {
  it('payment_confirmed vira o evento SSE nomeado order_payment (contrato do furo — front escuta por esse nome)', async () => {
    const bus = new InMemoryOrderEventBus();
    const controller = new OrderStreamController(bus);
    const events: MessageEvent[] = [];

    const sub = controller.stream('tenant-1', req()).subscribe((e) => events.push(e));
    await bus.publish('tenant-1', { orderId: 'order-9', event: 'payment_confirmed', version: 2 });

    const payment = events.find((e) => e.type === 'order_payment');
    expect(payment).toBeDefined();
    // NÃO reusa status_changed — paymentStatus é eixo ortogonal (§5.5).
    expect(events.some((e) => e.type === 'order_status')).toBe(false);
    expect(JSON.parse(payment!.data as string).orderId).toBe('order-9');
    sub.unsubscribe();
  });
});
