import { type CallHandler, type ExecutionContext, Inject, Injectable, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, concatMap, from } from 'rxjs';
import { ORDER_EVENT_BUS } from '../orders.tokens';
import type { OrderEvent, OrderEventBus } from './order-event-bus';

interface PendingPublish {
  tenantId: string;
  event: OrderEvent;
}
type RequestWithPending = Request & { __ordersToPublish?: PendingPublish[] };

/**
 * Enfileira um cutuque pra publicar DEPOIS do commit. O handler chama isto (não
 * `bus.publish` direto) porque o publish direto dispararia DENTRO da transação
 * do RequestContextService.run(): o subscriber receberia o evento e faria o GET
 * REST antes do COMMIT — não acharia a linha (ou acharia e a transação faria
 * rollback). Ver OrderPublishInterceptor pra onde o flush acontece.
 */
export function queueOrderPublish(req: Request, tenantId: string, event: OrderEvent): void {
  const r = req as RequestWithPending;
  (r.__ordersToPublish ??= []).push({ tenantId, event });
}

/**
 * Publica os cutuques enfileirados DEPOIS do handler — e, registrado como
 * interceptor OUTER do TenantContextInterceptor (ordem no @UseInterceptors),
 * o `pipe` pós-handler daqui só roda quando o `run()` daquele (a transação)
 * já resolveu, ou seja, DEPOIS do COMMIT. É o que fecha a corrida
 * publish-antes-do-commit.
 *
 * Best-effort: falha de publish (Redis fora) NUNCA falha a resposta nem desfaz
 * a transição já commitada — o banco é a fonte da verdade e o cliente refaz o
 * GET REST no próximo evento ou no refetch periódico.
 */
@Injectable()
export class OrderPublishInterceptor implements NestInterceptor {
  constructor(@Inject(ORDER_EVENT_BUS) private readonly bus: OrderEventBus) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithPending>();
    return next.handle().pipe(
      concatMap((value) =>
        from(
          (async () => {
            for (const p of req.__ordersToPublish ?? []) {
              try {
                await this.bus.publish(p.tenantId, p.event);
              } catch {
                // engolido de propósito — cutuque best-effort, banco é a verdade
              }
            }
            return value;
          })(),
        ),
      ),
    );
  }
}
