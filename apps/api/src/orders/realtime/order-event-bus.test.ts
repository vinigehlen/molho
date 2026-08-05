import type Redis from 'ioredis';
import { afterEach, describe, expect, it } from 'vitest';
import {
  InMemoryOrderEventBus,
  OrderEventHub,
  RedisOrderEventBus,
  type OrderEvent,
} from './order-event-bus';

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

describe('RedisOrderEventBus — carimbo `_via` atrás da flag de debug', () => {
  const fakeRedis = () => {
    const published: [string, string][] = [];
    const pub = { publish: async (ch: string, msg: string) => void published.push([ch, msg]) };
    const sub = { psubscribe: async () => undefined, on: () => undefined };
    return { published, bus: new RedisOrderEventBus(pub as unknown as Redis, sub as unknown as Redis) };
  };

  afterEach(() => {
    delete process.env.MOLHO_DEBUG_PUBSUB;
    delete process.env.FLY_MACHINE_ID;
  });

  it('flag DESLIGADA: mensagem no canal é byte a byte a de hoje', async () => {
    const { published, bus } = fakeRedis();
    await bus.publish('tenant-1', EVENT);
    expect(published).toEqual([['merchant.tenant-1.orders', JSON.stringify(EVENT)]]);
  });

  it('flag LIGADA: carimba a máquina de ORIGEM na mensagem publicada', async () => {
    process.env.MOLHO_DEBUG_PUBSUB = '1';
    process.env.FLY_MACHINE_ID = 'maquina-A';
    const { published, bus } = fakeRedis();

    await bus.publish('tenant-1', EVENT);

    expect(JSON.parse(published[0]![1])).toEqual({ ...EVENT, _via: 'maquina-A' });
  });
});
