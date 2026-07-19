import { SetMetadata } from '@nestjs/common';
import type { ModuleKey } from '@molho/contracts';

export const REQUIRE_MODULE_KEY = 'require_module';

/**
 * Aceita classe (controller inteiro) ou método — RequireModuleGuard lê os
 * dois com `getAllAndOverride` (handler vence se ambos estiverem presentes).
 */
export const RequireModule = (moduleKey: ModuleKey): ClassDecorator & MethodDecorator =>
  SetMetadata(REQUIRE_MODULE_KEY, moduleKey);
