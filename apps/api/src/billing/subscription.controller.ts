import { ConflictException, Controller, ForbiddenException, Get, Inject, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { SubscriptionResponse } from '@molho/contracts';
import { AllowWhileSuspended } from '../auth/guards/allow-while-suspended.decorator';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { toSubscriptionResponse } from './subscription-response';
import { SubscriptionAlreadyCanceledError } from './subscription.errors';
import { SUBSCRIPTION_SERVICE } from './subscription.tokens';
import type { SubscriptionService } from './subscription.service';

/**
 * Assinatura da PRÓPRIA loja (Épico 13d) — "cancelamento em 2 cliques": o
 * front mostra um passo de confirmação, o segundo clique É esta chamada.
 * `@AllowWhileSuspended()` na classe inteira: um lojista suspenso PRECISA
 * conseguir ver por que está suspenso e cancelar — não pode ficar trancado
 * fora do próprio painel sem explicação (`TenantContextInterceptor` lê este
 * metadata e pula o bloqueio de assinatura só pra esta rota).
 */
@Controller('v1/admin/subscription')
@UseGuards(JwtAuthGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@AllowWhileSuspended()
export class SubscriptionController {
  constructor(@Inject(SUBSCRIPTION_SERVICE) private readonly subscriptions: SubscriptionService) {}

  @Get()
  async get(@Req() req: RequestWithUser): Promise<SubscriptionResponse> {
    const tenantId = requireTenantIdHeader(req);
    return toSubscriptionResponse(await this.subscriptions.currentStatus(tenantId));
  }

  @Post('cancel')
  @RequirePermission('billing.manage')
  async cancel(@Req() req: RequestWithUser): Promise<SubscriptionResponse> {
    const tenantId = requireTenantIdHeader(req);
    const role = resolveActorRole(req, tenantId);
    try {
      return toSubscriptionResponse(await this.subscriptions.cancel(tenantId, { id: req.user.sub, role }));
    } catch (error) {
      if (error instanceof SubscriptionAlreadyCanceledError) throw new ConflictException(error.message);
      throw error;
    }
  }
}

/** Mesmo helper local repetido em order-admin.controller.ts/order-payment.controller.ts/etc — audit_log quer o papel REAL do ator neste tenant, não um valor fixo. */
function resolveActorRole(req: RequestWithUser, tenantId: string): string {
  const scope = req.user.scopes.find((s) => s.scopeType === 'platform' || (s.scopeType === 'tenant' && s.scopeId === tenantId));
  if (!scope) throw new ForbiddenException('Sem papel atribuído para este tenant.');
  return scope.role;
}
