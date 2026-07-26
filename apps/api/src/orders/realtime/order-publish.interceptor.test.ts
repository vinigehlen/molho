import { type CallHandler, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { OrderEvent, OrderEventBus } from './order-event-bus';
import { OrderPublishInterceptor, queueOrderPublish } from './order-publish.interceptor';

function ctx(req: Request): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

const EVENT: OrderEvent = { orderId: 'order-1', event: 'status_changed', version: 3 };

describe('OrderPublishInterceptor', () => {
  it('publica o que o handler enfileirou, DEPOIS que o handler emite', async () => {
    const order: string[] = [];
    const bus: OrderEventBus = {
      publish: vi.fn(async (tenantId: string) => {
        order.push(`publish:${tenantId}`);
      }),
      subscribe: vi.fn(() => () => {}),
    };
    const req = {} as Request;
    // handler enfileira e "emite" (o queue acontece no handler, antes do flush)
    const next: CallHandler = {
      handle: () => {
        queueOrderPublish(req, 'tenant-1', EVENT);
        order.push('handler');
        return of('resposta');
      },
    };

    const result = await firstValueFrom(new OrderPublishInterceptor(bus).intercept(ctx(req), next));

    expect(result).toBe('resposta'); // passa o valor do handler adiante
    expect(order).toEqual(['handler', 'publish:tenant-1']); // publish DEPOIS do handler
    expect(bus.publish).toHaveBeenCalledWith('tenant-1', EVENT);
  });

  it('sem nada enfileirado: não publica, só repassa', async () => {
    const bus: OrderEventBus = { publish: vi.fn(), subscribe: vi.fn(() => () => {}) };
    const next: CallHandler = { handle: () => of('ok') };

    const result = await firstValueFrom(new OrderPublishInterceptor(bus).intercept(ctx({} as Request), next));

    expect(result).toBe('ok');
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('falha de publish (Redis fora) NÃO derruba a resposta — best-effort', async () => {
    const bus: OrderEventBus = {
      publish: vi.fn(async () => {
        throw new Error('redis down');
      }),
      subscribe: vi.fn(() => () => {}),
    };
    const req = {} as Request;
    const next: CallHandler = {
      handle: () => {
        queueOrderPublish(req, 'tenant-1', EVENT);
        return of('resposta');
      },
    };

    const result = await firstValueFrom(new OrderPublishInterceptor(bus).intercept(ctx(req), next));
    expect(result).toBe('resposta'); // resposta sobrevive ao publish quebrado
  });
});
