import { describe, expect, it } from 'vitest';
import { InMemoryOrderEventBus, OrderEventHub, type OrderEvent } from './order-event-bus';

const EVENT: OrderEvent = { orderId: 'order-1', event: 'new', version: 0 };

describe('OrderEventHub — isolamento de tenant no despacho', () => {
  it('só entrega ao subscriber cujo tenant congelado bate com o do evento', () => {
    const hub = new OrderEventHub();
    const t1: OrderEvent[] = [];
    const t2: OrderEvent[] = [];
    hub.subscribe('tenant-1', (e) => t1.push(e));
    hub.subscribe('tenant-2', (e) => t2.push(e));

    hub.dispatch('tenant-1', EVENT);

    expect(t1).toEqual([EVENT]);
    expect(t2).toEqual([]); // NUNCA vaza pro outro tenant
  });

  it('entrega a TODOS os subscribers do mesmo tenant (várias abas do gestor)', () => {
    const hub = new OrderEventHub();
    const abas: OrderEvent[][] = [[], [], []];
    abas.forEach((aba) => hub.subscribe('tenant-1', (e) => aba.push(e)));

    hub.dispatch('tenant-1', EVENT);

    for (const aba of abas) expect(aba).toEqual([EVENT]);
  });

  it('unsubscribe para de entregar e limpa o registro', () => {
    const hub = new OrderEventHub();
    const got: OrderEvent[] = [];
    const off = hub.subscribe('tenant-1', (e) => got.push(e));

    off();
    hub.dispatch('tenant-1', EVENT);

    expect(got).toEqual([]);
    expect(hub.size).toBe(0);
  });
});

describe('InMemoryOrderEventBus', () => {
  it('publish despacha pro subscriber do mesmo tenant', async () => {
    const bus = new InMemoryOrderEventBus();
    const got: OrderEvent[] = [];
    bus.subscribe('tenant-1', (e) => got.push(e));

    await bus.publish('tenant-1', EVENT);
    await bus.publish('tenant-2', { ...EVENT, orderId: 'outro' });

    expect(got).toEqual([EVENT]); // o do tenant-2 não chega
  });
});
