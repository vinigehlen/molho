import { Body, Controller, Get, Inject, Post, Req, UseGuards } from '@nestjs/common';
import {
  type PlatformTenantsResponse,
  type ProvisionTenantInput,
  type ProvisionTenantResponse,
  provisionTenantSchema,
} from '@molho/contracts';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { PlatformContextGuard } from '../auth/guards/platform-context.guard';
import { RequirePlatformContext } from '../auth/guards/platform-context.decorator';
import type { PlatformProvisioningService } from './platform-provisioning.service';
import { PLATFORM_PROVISIONING_SERVICE } from './platform-provisioning.tokens';
import { ZodValidationPipe } from './zod-validation.pipe';

const SUPERADMIN_ROLE = 'platform.superadmin';

/**
 * Lista de tenants pro super-admin (Épico 14.5) — sem isso o painel de
 * módulos e o provisionamento de staff (que exigem `tenantId`/`scopeId` na
 * URL/body) não tinham como o super-admin descobrir o ID de um tenant pela
 * UI. Mesmo desenho de guard de module-panel/staff-provisioning:
 * `@RequirePlatformContext` é o único ponto de entrada em contexto-
 * plataforma, sem `TenantContextInterceptor` (cross-tenant por natureza).
 */
@Controller('v1/admin/platform/tenants')
@UseGuards(JwtAuthGuard, PlatformContextGuard)
@RequirePlatformContext()
export class PlatformTenantsController {
  constructor(
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
    @Inject(PLATFORM_PROVISIONING_SERVICE) private readonly provisioning: PlatformProvisioningService,
  ) {}

  @Get()
  async list(): Promise<PlatformTenantsResponse> {
    return this.requestContext.run({ tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true }, async () => {
      const client = this.requestContext.getClient();
      const tenants = await client.tenant.findMany({
        where: { deletedAt: null },
        select: { id: true, slug: true, name: true, planId: true, status: true },
        orderBy: { name: 'asc' },
      });
      return { tenants };
    });
  }

  /**
   * Provisionamento de domínio pelo super-admin (Épico 14.6) — distinto do
   * self-signup (`/v1/signup/*`): aqui é venda assistida, o painel interno
   * cria o tenant direto. Mesmo desenho de contexto-plataforma do `list()`
   * acima.
   */
  @Post()
  async provision(
    @Body(new ZodValidationPipe(provisionTenantSchema)) dto: ProvisionTenantInput,
    @Req() req: RequestWithUser,
  ): Promise<ProvisionTenantResponse> {
    return this.requestContext.run({ tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true }, () =>
      this.provisioning.provision(dto, { id: req.user.sub, role: SUPERADMIN_ROLE }),
    );
  }
}
