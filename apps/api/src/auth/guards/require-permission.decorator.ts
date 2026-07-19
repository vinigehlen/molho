import { SetMetadata } from '@nestjs/common';
import type { Permission } from '@molho/contracts';

export const REQUIRE_PERMISSION_KEY = 'require_permission';

export const RequirePermission = (permission: Permission): MethodDecorator =>
  SetMetadata(REQUIRE_PERMISSION_KEY, permission);
