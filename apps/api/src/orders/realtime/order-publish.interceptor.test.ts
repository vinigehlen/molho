import { type CallHandler, type ExecutionContext, Logger } from '@nestjs/common';
import type { Request } from 'express';
import { firstValueFrom, of } from 'rxjs';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RequestContextService } from '../../context/request-context.service';
import type { OrderEvent, OrderEventBus } from './order-event-bus';
import { OrderPublishInterceptor, queueOrderPublish } from './order-publish.interceptor';

function ctx(req: Request): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => req }) } as unknown as ExecutionContext;
}

const EVENT: OrderEvent = { orderId: 'order-1', event: 'status_changed', version: 3 };

/** RequestContextService só precisa de hasActiveContext aqui. */
function fakeContext(active: boolean): RequestContextService {
  return { hasActiveContext: () => active } as unknown as RequestContextService;
}

function busOk(): OrderEventBus {
  return { publish: vi.fn(async () => {}), subscribe: vi.fn(() => () => {}) };
}

afterEach(() => vi.restoreAllMocks());

describe('OrderPublishInterceptor', () => {
  it('publica o que o handler enfileirou e repassa a resposta (fora de transação)', async () => {
    const bus = busOk();
    const req = {} as Request;
    const next: CallHandler = {
      handle: () => {
        queueOrderPublish(req, 'tenant-1', EVENT);
        return of('resposta');
      },
    };

    const result = await firstValueFrom(new OrderPublishInterceptor(bus, fakeContext(false)).intercept(ctx(req), next));

    expect(result).toBe('resposta');
    expect(bus.publish).toHaveBeenCalledWith('tenant-1', EVENT);
  });

  it('ORDEM ERRADA (contexto de transação ainda ativo) com publish pendente → lança, não publica', async () => {
    const bus = busOk();
    const req = {} as Request;
    const next: CallHandler = {
      handle: () => {
        queueOrderPublish(req, 'tenant-1', EVENT);
        return of('resposta');
      },
    };

    await expect(
      firstValueFrom(new OrderPublishInterceptor(bus, fakeContext(true)).intercept(ctx(req), next)),
    ).rejects.toThrow(/OUTER do TenantContextInterceptor/);
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('sem publish pendente: não asserta nem publica, mesmo com contexto ativo', async () => {
    const bus = busOk();
    const next: CallHandler = { handle: () => of('ok') };

    const result = await firstValueFrom(
      new OrderPublishInterceptor(bus, fakeContext(true)).intercept(ctx({} as Request), next),
    );

    expect(result).toBe('ok');
    expect(bus.publish).not.toHaveBeenCalled();
  });

  it('FIRE-AND-FORGET: resposta emite sem aguardar o publish', async () => {
    let resolvePublish!: () => void;
    const bus: OrderEventBus = {
      publish: vi.fn(() => new Promise<void>((r) => (resolvePublish = r))), // nunca resolve durante o teste
      subscribe: vi.fn(() => () => {}),
    };
    const req = {} as Request;
    const next: CallHandler = {
      handle: () => {
        queueOrderPublish(req, 'tenant-1', EVENT);
        return of('resposta');
      },
    };

    // Se o publish estivesse no caminho crítico, isto travaria (a promise não resolve).
    const result = await firstValueFrom(new OrderPublishInterceptor(bus, fakeContext(false)).intercept(ctx(req), next));
    expect(result).toBe('resposta');
    resolvePublish();
  });

  it('falha de publish é LOGADA, não engolida em silêncio (e não derruba a resposta)', async () => {
    const errorSpy = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
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

    const result = await firstValueFrom(new OrderPublishInterceptor(bus, fakeContext(false)).intercept(ctx(req), next));
    expect(result).toBe('resposta');
    await vi.waitFor(() => expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('falha ao publicar cutuque')));
  });
});
