import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@molho/contracts';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

/** Aceita classe (ex.: CatalogImportController, uma permissão pro controller inteiro) ou método — RequirePermissionGuard lê os dois com `getAllAndOverride`. */
export const RequirePermission = (permission: Permission): ClassDecorator & MethodDecorator =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
