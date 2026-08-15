import { BadRequestException, Body, Controller, ConflictException, Get, Inject, NotFoundException, Param, Put, Req, UseGuards } from '@nestjs/common';
import { type ModuleStatesResponse, type SetEntitlementInput, setEntitlementSchema } from '@molho/contracts';
import { RequestContextService } from '../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../context/tenant-context.constants';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { PlatformContextGuard } from '../auth/guards/platform-context.guard';
import { RequirePlatformContext } from '../auth/guards/platform-context.decorator';
import { CoreModuleError, InvalidModuleKeyError, MissingRequirementsError } from './module-panel.errors';
import { MODULE_PANEL_SERVICE } from './module-panel.tokens';
import type { ModulePanelService } from './module-panel.service';
import { ScopeNotFoundError } from './staff-provisioning.errors';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Painel de módulos do super-admin (Épico 14.4) — mesmo desenho de guard do
 * staff-provisioning.controller.ts: `@RequirePlatformContext` é o único
 * ponto de entrada em contexto-plataforma, `JwtAuthGuard` ANTES na ordem, e
 * a rota abre o próprio `requestContext.run({isPlatform:true})` (cross-tenant
 * por natureza — o super-admin gerencia QUALQUER tenant).
 */
@Controller('v1/admin/platform/tenants/:tenantId')
@UseGuards(JwtAuthGuard, PlatformContextGuard)
@RequirePlatformContext()
export class ModulePanelController {
  constructor(
    @Inject(MODULE_PANEL_SERVICE) private readonly panel: ModulePanelService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Get('modules')
  async list(@Param('tenantId') tenantId: string): Promise<ModuleStatesResponse> {
    const modules = await this.run(() => this.panel.getModuleStates(tenantId));
    return { modules };
  }

  @Put('entitlements/:moduleKey')
  async setEntitlement(
    @Param('tenantId') tenantId: string,
    @Param('moduleKey') moduleKey: string,
    @Body(new ZodValidationPipe(setEntitlementSchema)) dto: SetEntitlementInput,
    @Req() req: RequestWithUser,
  ) {
    return this.run(() => this.panel.setEntitlement(tenantId, moduleKey, dto, req.user.sub));
  }

  private async run<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await this.requestContext.run({ tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true }, fn);
    } catch (error) {
      if (error instanceof ScopeNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof InvalidModuleKeyError) throw new BadRequestException(error.message);
      if (error instanceof CoreModuleError) throw new BadRequestException(error.message);
      if (error instanceof MissingRequirementsError) {
        throw new ConflictException({ message: error.message, missing: error.missing });
      }
      throw error;
    }
  }
}
