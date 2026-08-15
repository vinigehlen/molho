import { type CanActivate, type ExecutionContext, ForbiddenException, Inject, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { RequestWithUser } from './jwt-auth.guard';
import { REQUIRE_PLATFORM_CONTEXT_KEY } from './platform-context.decorator';

/**
 * O ÚNICO ponto de entrada em contexto-plataforma (Épico 14). Contexto-
 * plataforma é bypass de RLS (`requestContext.run({ isPlatform: true })`) —
 * qualquer endpoint que abra esse contexto tem que estar atrás deste guard,
 * decorado com `@RequirePlatformContext()`. Roda como Guard (não Interceptor)
 * de propósito: Guards executam ANTES de qualquer Interceptor, então barra o
 * request antes mesmo de TenantContextInterceptor cogitar abrir a transação
 * (mesmo racional de ordering de RequirePermissionGuard/RequireModuleGuard).
 *
 * Depende de request.user já populado — precisa rodar DEPOIS de JwtAuthGuard
 * na ordem de `@UseGuards`.
 *
 * @Inject(Reflector) explícito — mesmo achado de RequireModuleGuard/
 * RequirePermissionGuard (esbuild do Vitest não emite emitDecoratorMetadata
 * de forma confiável pra DI implícita).
 */
@Injectable()
export class PlatformContextGuard implements CanActivate {
  constructor(@Inject(Reflector) private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_PLATFORM_CONTEXT_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required) return true; // rota sem @RequirePlatformContext não passa por este guard, de propósito

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const hasSuperadmin = request.user.scopes.some(
      (scope) => scope.scopeType === 'platform' && scope.role === 'platform.superadmin',
    );
    if (!hasSuperadmin) {
      throw new ForbiddenException('Requer papel platform.superadmin.');
    }
    return true;
  }
}
