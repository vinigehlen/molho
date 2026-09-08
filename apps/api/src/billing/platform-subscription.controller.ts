import { Body, Controller, ForbiddenException, Get, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import { markSubscriptionPaidSchema, type MarkSubscriptionPaidInput, type SubscriptionResponse } from '@molho/contracts';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { PlatformContextGuard } from '../auth/guards/platform-context.guard';
import { RequirePlatformContext } from '../auth/guards/platform-context.decorator';
import { toSubscriptionResponse } from './subscription-response';
import { SubscriptionCanceledError, TenantNotFoundError } from './subscription.errors';
import { SUBSCRIPTION_SERVICE } from './subscription.tokens';
import type { SubscriptionService } from './subscription.service';
import { ZodValidationPipe } from './zod-validation.pipe';

const SUPERADMIN_ROLE = 'platform.superadmin';

/**
 * Assinatura de QUALQUER tenant, vista pelo super-admin (Épico 13d) — mesmo
 * desenho de guard de module-panel/impersonation: `@RequirePlatformContext`
 * é o único ponto de entrada em contexto-plataforma, sem
 * `TenantContextInterceptor` (cross-tenant por natureza — o super-admin
 * mexe em QUALQUER tenant, inclusive um já suspenso).
 */
@Controller('v1/admin/platform/tenants/:tenantId/subscription')
@UseGuards(JwtAuthGuard, PlatformContextGuard)
@RequirePlatformContext()
export class PlatformSubscriptionController {
  constructor(
    @Inject(SUBSCRIPTION_SERVICE) private readonly subscriptions: SubscriptionService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  async get(@Param('tenantId') tenantId: string): Promise<SubscriptionResponse> {
    return this.run(async () => toSubscriptionResponse(await this.subscriptions.currentStatus(tenantId)));
  }

  /** Super-admin confirma "recebi o PIX/boleto" na mão — reabre `active` a partir de qualquer estado não-cancelado, inclusive `suspended`. */
  @Post('mark-paid')
  async markPaid(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(markSubscriptionPaidSchema)) dto: MarkSubscriptionPaidInput,
    @Req() req: RequestWithUser,
  ): Promise<SubscriptionResponse> {
    return this.run(async () =>
      toSubscriptionResponse(
        await this.subscriptions.markPaid(tenantId, dto.periodDays, { id: req.user.sub, role: SUPERADMIN_ROLE }),
      ),
    );
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.requestContext.run({ tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true }, fn);
    } catch (error) {
      if (error instanceof TenantNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SubscriptionCanceledError) throw new ForbiddenException(error.message);
      throw error;
    }
  }
}
