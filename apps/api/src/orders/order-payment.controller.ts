import { Body, Controller, ForbiddenException, HttpCode, HttpStatus, Inject, Param, Patch, Req, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { ConfirmPaymentDto } from './dto/confirm-payment.dto';
import { OrderExceptionFilter } from './order-exception.filter';
import { PAYMENT_CONFIRMATION_SERVICE } from './orders.tokens';
import type { PaymentConfirmationService } from './payment-confirmation.service';
import { OrderPublishInterceptor, queueOrderPublish } from './realtime/order-publish.interceptor';

/**
 * Reconciliação manual do PIX estático (Épico 8) — o lojista confere o app
 * do banco e confirma aqui. Rota de staff (`v1/admin`, JWT + permissão),
 * bem diferente de `CheckoutController` (customer JWT, storefront público).
 * Sem UI própria neste épico: o botão nasce no gestor de pedidos (Épico 9);
 * este endpoint já é o contrato final, só sem consumidor de tela ainda.
 */
@Controller('v1/admin/orders')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
// OrderPublishInterceptor ANTES do TenantContextInterceptor (outer): o flush do
// cutuque roda depois do commit da transação. Mesmo motivo do OrderAdminController.
@UseInterceptors(OrderPublishInterceptor, TenantContextInterceptor)
@UseFilters(OrderExceptionFilter)
@RequireModule('payments.pix_static')
export class OrderPaymentController {
  constructor(
    @Inject(PAYMENT_CONFIRMATION_SERVICE) private readonly paymentConfirmation: PaymentConfirmationService,
  ) {}

  @Patch(':id/payment/confirm')
  @RequirePermission('payment.confirm')
  @HttpCode(HttpStatus.NO_CONTENT)
  async confirm(@Param('id') id: string, @Body() dto: ConfirmPaymentDto, @Req() req: RequestWithUser): Promise<void> {
    const tenantId = requireTenantIdHeader(req);
    const role = resolveActorRole(req, tenantId);
    await this.paymentConfirmation.confirmPayment({
      orderId: id,
      expectedVersion: dto.version,
      actor: { userId: req.user.sub, role },
    });

    // Cutuque pós-commit (flush no OrderPublishInterceptor): sem isto, o segundo
    // tablet da cozinha segue mostrando "aguardando pagamento" e o gate de
    // preparo (§5.5) barra num board desatualizado. Evento PRÓPRIO (não
    // status_changed) — paymentStatus é eixo ortogonal. version = dto.version+1
    // (o lock otimista da confirmação bumpa a versão).
    queueOrderPublish(req, tenantId, { orderId: id, event: 'payment_confirmed', version: dto.version + 1 });
  }
}

/**
 * `RequirePermissionGuard` já garantiu que ALGUMA atribuição do ator cobre
 * esta permissão neste tenant (senão a request nem chegaria aqui) — isto só
 * escolhe QUAL papel vira `actor_role` no audit_log (mesmo critério de
 * cobertura de `TenantContextInterceptor.resolveTenantContext`: tenant
 * exato ou platform).
 */
function resolveActorRole(req: RequestWithUser, tenantId: string): string {
  const scope = req.user.scopes.find((s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId));
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return scope.role;
}
