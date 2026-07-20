import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type ModuleCache, ModuleService, PrismaModuleDataSource } from '@molho/db';
import type { ModuleKey } from '@molho/contracts';
import type { Request } from 'express';
import { RequestContextService } from '../../context/request-context.service';
import { PLATFORM_CONTEXT_TENANT_ID } from '../../context/tenant-context.constants';
import { TenantLookupRepository } from '../tenant-lookup.repository';
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
 *
 * @Inject(Reflector) explícito (não implícito por tipo): esbuild do Vitest
 * não emite emitDecoratorMetadata de forma confiável pra DI implícita —
 * mesmo achado já documentado em staff-auth.controller.ts/
 * customer-auth.controller.ts (funcionava sob `nest start`, quebrava sob
 * `Test.createTestingModule` do Vitest com "Reflector" undefined).
 */
@Injectable()
export class RequireModuleGuard implements CanActivate {
  constructor(
    @Inject(Reflector) private readonly reflector: Reflector,
    @Inject(MODULE_CACHE) private readonly cache: ModuleCache,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const moduleKey = this.reflector.getAllAndOverride<ModuleKey | undefined>(REQUIRE_MODULE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!moduleKey) return true; // rota sem @RequireModule não passa por este guard, de propósito

    const request = context.switchToHttp().getRequest<Request & { params: Record<string, string> }>();
    const slug = request.params?.slug;

    // Uma única transação de plataforma cobre as DUAS leituras (resolver o
    // slug e checar o módulo) — abrir duas seria pagar dois round-trips pra
    // responder a mesma pergunta.
    const active = await this.requestContext.run(
      { tenantId: PLATFORM_CONTEXT_TENANT_ID, isPlatform: true },
      async () => {
        const tenantId = slug ? await this.resolveTenantIdFromSlug(slug) : requireTenantIdHeader(request);

        const moduleService = new ModuleService({
          db: new PrismaModuleDataSource(this.requestContext.getClient()),
          cache: this.cache,
        });
        return moduleService.isModuleActive(tenantId, moduleKey);
      },
    );

    if (!active) throw new ForbiddenException(`Módulo "${moduleKey}" não está ativo para este tenant.`);
    return true;
  }

  /**
   * Rota pública de storefront (`:slug` no path): o tenant vem da URL, não do
   * header. Este guard roda ANTES de TenantContextInterceptor (guards precedem
   * interceptors no ciclo do Nest), então não dá pra reaproveitar o tenant que
   * o interceptor resolve depois — cada um faz sua leitura, mesmo padrão já
   * usado por JwtAuthGuard.
   *
   * Devolve 404 (não 403) quando o slug não existe: quem digitou o link errado
   * precisa saber que a loja não existe, e a alternativa vazaria a diferença
   * entre "loja inexistente" e "loja sem o módulo".
   */
  private async resolveTenantIdFromSlug(slug: string): Promise<string> {
    const tenant = await new TenantLookupRepository(this.requestContext).findBySlug(slug);
    if (!tenant) throw new NotFoundException('Loja não encontrada.');
    return tenant.id;
  }
}
