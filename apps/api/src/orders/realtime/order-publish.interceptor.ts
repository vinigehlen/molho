import { type CallHandler, type ExecutionContext, Inject, Injectable, Logger, type NestInterceptor } from '@nestjs/common';
import type { Request } from 'express';
import { type Observable, tap } from 'rxjs';
import { RequestContextService } from '../../context/request-context.service';
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
 * o `tap` pós-handler daqui só roda quando o `run()` daquele (a transação) já
 * resolveu, ou seja, DEPOIS do COMMIT. É o que fecha a corrida
 * publish-antes-do-commit.
 *
 * A ordem certa é AUTO-VERIFICÁVEL, não um comentário: se houver publish
 * pendente e ainda existir contexto de transação ativo (interceptor invertido,
 * publish viraria INNER), `hasActiveContext()` acusa e a request falha
 * BARULHENTA na hora — não vira corrida silenciosa numa sessão futura.
 *
 * FIRE-AND-FORGET: o publish NÃO é aguardado — não soma a latência do Upstash
 * na resposta (crítico no checkout do cliente final; pub/sub é cutuque, não
 * infra crítica, e o banco é a fonte da verdade). Erro de publish é LOGADO
 * (nunca engolido em silêncio): Upstash fora = zero realtime, mas com sinal no
 * log, não "os pedidos pararam de aparecer sozinhos" sem pista.
 */
@Injectable()
export class OrderPublishInterceptor implements NestInterceptor {
  private readonly logger = new Logger(OrderPublishInterceptor.name);

  constructor(
    @Inject(ORDER_EVENT_BUS) private readonly bus: OrderEventBus,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestWithPending>();
    return next.handle().pipe(
      tap(() => {
        const pending = req.__ordersToPublish;
        if (!pending?.length) return;

        if (this.requestContext.hasActiveContext()) {
          // Interceptor invertido: o publish rodaria dentro da transação
          // (pré-commit). Falha barulhenta em vez de corrida silenciosa.
          throw new Error(
            'OrderPublishInterceptor precisa ser OUTER do TenantContextInterceptor — publish estaria dentro da transação (pré-commit).',
          );
        }

        for (const p of pending) {
          this.bus.publish(p.tenantId, p.event).catch((err: unknown) => {
            this.logger.error(
              `falha ao publicar cutuque de pedido (tenant=${p.tenantId}, event=${p.event.event}, order=${p.event.orderId}): ${String(err)}`,
            );
          });
        }
      }),
    );
  }
}
