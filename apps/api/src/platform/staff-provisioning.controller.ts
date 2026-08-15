import { Body, Controller, Inject, NotFoundException, Post, Req, UseGuards } from '@nestjs/common';
import { type ProvisionStaffInput, type ProvisionStaffResponse, provisionStaffSchema } from '@molho/contracts';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { PlatformContextGuard } from '../auth/guards/platform-context.guard';
import { RequirePlatformContext } from '../auth/guards/platform-context.decorator';
import { ScopeNotFoundError } from './staff-provisioning.errors';
import { STAFF_PROVISIONING_SERVICE } from './staff-provisioning.tokens';
import type { StaffProvisioningService } from './staff-provisioning.service';
import { ZodValidationPipe } from './zod-validation.pipe';

const SUPERADMIN_ROLE = 'platform.superadmin';

/**
 * Único jeito de dar o PRIMEIRO papel a um staff fora do seed (Épico 14.3) —
 * o OTP de staff (Épico 9c) nunca cria User/user_role. `@RequirePlatformContext`
 * é o ÚNICO ponto de entrada em contexto-plataforma desta rota — JwtAuthGuard
 * ANTES na ordem, porque PlatformContextGuard lê `request.user` (populado só
 * depois de JwtAuthGuard rodar). Sem TenantContextInterceptor: a rota é
 * cross-tenant por natureza (super-admin provisiona em QUALQUER tenant/store),
 * então abre o próprio requestContext.run({isPlatform:true}) — mesmo padrão
 * do verify de staff-auth.controller.ts.
 */
@Controller('v1/admin/platform/staff')
@UseGuards(JwtAuthGuard, PlatformContextGuard)
@RequirePlatformContext()
export class StaffProvisioningController {
  constructor(
    @Inject(STAFF_PROVISIONING_SERVICE) private readonly provisioning: StaffProvisioningService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Post()
  async provision(
    @Body(new ZodValidationPipe(provisionStaffSchema)) dto: ProvisionStaffInput,
    @Req() req: RequestWithUser,
  ): Promise<ProvisionStaffResponse> {
    try {
      return await this.requestContext.run(
        { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
        () => this.provisioning.provision(dto, { id: req.user.sub, role: SUPERADMIN_ROLE }),
      );
    } catch (error) {
      if (error instanceof ScopeNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
