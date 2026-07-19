import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import type { ModuleKey } from '@molho/contracts';
import type { Request } from 'express';
import { RequestContextService } from '../../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../../context/tenant-context.constants';
import { MODULE_CACHE } from '../../modules/module-check.module';
import { REQUIRE_MODULE_KEY } from './require-module.decorator';
import { requireTenantIdHeader } from './tenant-header.util';

/**
 * `catalog` é `core: true` no registry (packages/contracts/modules.ts) — pra
 * este épico especificamente, `isModuleActive` nunca chega a tocar o banco
 * (curto-circuita em `def.core`). O guard é construído de forma genérica
 * mesmo assim: todo módulo NÃO-core que usar `@RequireModule` no futuro
 * precisa deste caminho de verdade (entitlement + setting + flag).
 *
 * ModuleService/PrismaModuleDataSource são construídos por REQUEST, dentro
 * do `.run()` deste guard — nunca injetados como singleton do Nest, porque
 * `PrismaModuleDataSource` só pode usar o client transacional do request
 * (CLAUDE.md § Contexto de request), que não existe fora de um `.run()`.
 */
@Injectable()
export class RequireModuleGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(MODULE_CACHE) private readonly cache: ModuleCache,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleKey) return true; // rota sem @RequireModule não passa por este guard, de propósito

    const request = context.switchToHttp().getRequest<Request>();
    const tenantId = requireTenantIdHeader(request);

    const active = await this.requestContext.run({ tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true }, () => {
      const moduleService = new ModuleService({
        db: new PrismaModuleDataSource(this.requestContext.getClient()),
        cache: this.cache,
      });
      return moduleService.isModuleActive(tenantId, moduleKey);
    });

    if (!active) throw new ForbiddenException(`Módulo "${moduleKey}" não está ativo para este tenant.`);
    return true;
  }
}
