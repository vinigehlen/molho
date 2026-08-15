import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, expect, it } from 'vitest';
import type { TokenScope } from '../token/token-payload';
import { PlatformContextGuard } from './platform-context.guard';
import { RequirePlatformContext } from './platform-context.decorator';

class GuardedController {
  @RequirePlatformContext()
  guardedHandler() {}

  openHandler() {}
}

function contextWithScopes(scopes: TokenScope[], guarded: boolean) {
  const request = { user: { sub: 'user-1', roles: [], scopes, tokenVersion: 0, deviceId: 'd1', jti: 'j1' } };
  const instance = new GuardedController();
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => (guarded ? instance.guardedHandler : instance.openHandler),
    getClass: () => GuardedController,
  } as unknown as ExecutionContext;
  return context;
}

describe('PlatformContextGuard', () => {
  const reflector = new Reflector();

  it('rota sem @RequirePlatformContext: deixa passar sem checar nada', () => {
    const guard = new PlatformContextGuard(reflector);
    const context = contextWithScopes([], false);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('rota guardada, JWT sem platform.superadmin: 403', () => {
    const guard = new PlatformContextGuard(reflector);
    const context = contextWithScopes(
      [{ role: 'platform_support', scopeType: 'platform', scopeId: null }],
      true,
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rota guardada, papel platform.superadmin em escopo tenant (não platform): 403', () => {
    const guard = new PlatformContextGuard(reflector);
    const context = contextWithScopes(
      [{ role: 'platform.superadmin', scopeType: 'tenant', scopeId: 'tenant-1' }],
      true,
    );

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rota guardada, JWT com platform.superadmin em escopo platform: passa', () => {
    const guard = new PlatformContextGuard(reflector);
    const context = contextWithScopes(
      [{ role: 'platform.superadmin', scopeType: 'platform', scopeId: null }],
      true,
    );

    expect(guard.canActivate(context)).toBe(true);
  });
});
