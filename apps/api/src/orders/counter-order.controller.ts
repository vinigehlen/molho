import {
  Body,
  Controller,
  ForbiddenException,
  Headers,
  Inject,
  Param,
  Post,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { type CounterOrderInput, type CounterOrderResponse, counterOrderSchema } from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { CounterOrderService } from './counter-order.service';
import { COUNTER_ORDER_SERVICE } from './orders.tokens';
import { OrderExceptionFilter } from './order-exception.filter';
import { ZodValidationPipe } from './zod-validation.pipe';
import { OrderPublishInterceptor, queueOrderPublish } from './realtime/order-publish.interceptor';

/**
 * Pedido de BALCÃO (walk-in create) — staff bate direto no caixa, já pago e
 * já entregue. Mesmo gate de permissão que o resto do gestor usa pra criar
 * pedido (`order.create`, owner/manager/cashier/waiter) — NUNCA
 * `@RequirePlatformContext` (isto é ação de LOJA, não de plataforma).
 * `RequireModule('orders')` é core (sempre ativo) — mesmo gate "de forma" de
 * OrderAdminController, não trava nada na prática.
 */
@Controller('v1/admin/stores/:storeId/counter-orders')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(OrderPublishInterceptor, TenantContextInterceptor)
@UseFilters(OrderExceptionFilter)
@RequireModule('orders')
export class CounterOrderController {
  constructor(@Inject(COUNTER_ORDER_SERVICE) private readonly counterOrders: CounterOrderService) {}

  @Post()
  @RequirePermission('order.create')
  async create(
    @Param('storeId') storeId: string,
    @Body(new ZodValidationPipe(counterOrderSchema)) dto: CounterOrderInput,
    @Req() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<CounterOrderResponse> {
    const tenantId = requireTenantIdHeader(req);
    const role = resolveActorRole(req, tenantId);
    const result = await this.counterOrders.createOrder(tenantId, storeId, dto, idempotencyKey, { id: req.user.sub, role });
    queueOrderPublish(req, tenantId, { orderId: result.orderId, event: 'new', version: 0 });
    return result;
  }
}

/** Mesmo critério de OrderAdminController/OrderPaymentController: escolhe QUAL papel vira actor_role no audit_log. */
function resolveActorRole(req: RequestWithUser, tenantId: string): string {
  const scope = req.user.scopes.find((s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId));
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return scope.role;
}
