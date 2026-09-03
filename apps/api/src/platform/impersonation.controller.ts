import { Body, Controller, Inject, NotFoundException, Param, Post, Req, UseGuards } from '@nestjs/common';
import {
  type ImpersonationSessionResponse,
  type StartImpersonationInput,
  startImpersonationSchema,
} from '@molho/contracts';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { PlatformContextGuard } from '../auth/guards/platform-context.guard';
import { RequirePlatformContext } from '../auth/guards/platform-context.decorator';
import { ScopeNotFoundError } from './staff-provisioning.errors';
import { IMPERSONATION_SERVICE } from './impersonation.tokens';
import type { ImpersonationService } from './impersonation.service';
import { ZodValidationPipe } from './zod-validation.pipe';

const SUPERADMIN_ROLE = 'platform.superadmin';

/**
 * Mesmo desenho de guard de módulo-panel/staff-provisioning (Épico 14):
 * `@RequirePlatformContext` é o único ponto de entrada em contexto-
 * plataforma; a trava de somente-leitura em si (bloquear POST/PUT/PATCH/
 * DELETE quando `readOnly: true`) vive no `JwtAuthGuard`, GLOBAL — aqui só
 * emite o token, não reforça o próprio limite que ele concede.
 */
@Controller('v1/admin/platform/tenants/:tenantId')
@UseGuards(JwtAuthGuard, PlatformContextGuard)
@RequirePlatformContext()
export class ImpersonationController {
  constructor(
    @Inject(IMPERSONATION_SERVICE) private readonly impersonation: ImpersonationService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Post('impersonate')
  async start(
    @Param('tenantId') tenantId: string,
    @Body(new ZodValidationPipe(startImpersonationSchema)) dto: StartImpersonationInput,
    @Req() req: RequestWithUser,
  ): Promise<ImpersonationSessionResponse> {
    try {
      return await this.requestContext.run(
        { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
        () => this.impersonation.start(tenantId, dto, { id: req.user.sub, role: SUPERADMIN_ROLE }),
      );
    } catch (error) {
      if (error instanceof ScopeNotFoundError) throw new NotFoundException(error.message);
      throw error;
    }
  }
}
