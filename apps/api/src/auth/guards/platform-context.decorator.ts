import { SetMetadata } from '@nestjs/common';

export const REQUIRE_PLATFORM_CONTEXT_KEY = 'require_platform_context';

/**
 * Marca um endpoint que entra em contexto-plataforma (`requestContext.run({
 * isPlatform: true })`, bypass de RLS) — PlatformContextGuard lê este
 * metadata e exige o papel `platform.superadmin` no JWT antes de deixar o
 * handler prosseguir. Sem este decorator, PlatformContextGuard deixa passar
 * (mesmo padrão de RequireModule/RequirePermission): a trava é opt-in por
 * rota, não global.
 */
export const RequirePlatformContext = (): ClassDecorator & MethodDecorator =>
  SetMetadata(REQUIRE_PLATFORM_CONTEXT_KEY, true);
