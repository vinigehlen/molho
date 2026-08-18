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
import { type OrderAdjustmentInput, type OrderAdjustmentResponse, orderAdjustmentSchema } from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { OrderAdjustmentService } from './order-adjustment.service';
import { ORDER_ADJUSTMENT_SERVICE } from './orders.tokens';
import { OrderExceptionFilter } from './order-exception.filter';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Edição de um pedido já criado — o gestor adiciona/remove/muda quantidade
 * de item enquanto o pedido ainda está em operação (Épico balcão — order
 * edit). Staff-only (JwtAuthGuard), NUNCA cliente: um token de cliente não
 * tem escopo de tenant/staff nenhum, então cai em `resolveActorRole` como
 * "sem papel atribuído" → 403, ou nem passa do `JwtAuthGuard` (é outro guard,
 * `CustomerJwtAuthGuard`) → 401, dependendo de qual token chega. Mesmo gate
 * de permissão que o resto do gestor usa (`order.update`, owner/manager
 * livre, cashier com aprovação — matriz §5-C.5).
 */
@Controller('v1/admin/stores/:storeId/orders/:orderId/adjustments')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(OrderExceptionFilter)
@RequireModule('orders')
export class OrderAdjustmentController {
  constructor(@Inject(ORDER_ADJUSTMENT_SERVICE) private readonly adjustments: OrderAdjustmentService) {}

  @Post()
  @RequirePermission('order.update')
  async create(
    @Param('storeId') storeId: string,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(orderAdjustmentSchema)) dto: OrderAdjustmentInput,
    @Req() req: RequestWithUser,
    @Headers('idempotency-key') idempotencyKey?: string,
  ): Promise<OrderAdjustmentResponse> {
    const tenantId = requireTenantIdHeader(req);
    const role = resolveActorRole(req, tenantId);
    return this.adjustments.applyAdjustment(tenantId, storeId, orderId, dto, idempotencyKey, {
      id: req.user.sub,
      role,
    });
  }
}

/** Mesmo critério de CounterOrderController/OrderAdminController: escolhe QUAL papel vira actor_role no audit_log. */
function resolveActorRole(req: RequestWithUser, tenantId: string): string {
  const scope = req.user.scopes.find((s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId));
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return scope.role;
}
