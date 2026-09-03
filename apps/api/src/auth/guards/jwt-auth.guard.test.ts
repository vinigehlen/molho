import type { ExecutionContext } from '@nestjs/common';
import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExpiredTokenError, InvalidTokenError, RevokedTokenError } from '../token/token-errors';
import { JwtAuthGuard } from './jwt-auth.guard';

function contextWithHeader(authorization: string | undefined, method = 'GET') {
  const request: { headers: Record<string, string | undefined>; method: string; user?: unknown } = {
    headers: authorization === undefined ? {} : { authorization },
    method,
  };
  const context = {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
  return { context, request };
}

/** run() real do RequestContextService abriria uma transação — aqui só chama o fn direto. */
function fakeRequestContext() {
  return { run: vi.fn((_ctx: unknown, fn: () => unknown) => Promise.resolve(fn())) };
}

describe('JwtAuthGuard', () => {
  it('sem header Authorization: 401', async () => {
    const tokenService = { verifyAccessToken: vi.fn() };
    const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader(undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('header sem "Bearer ": 401', async () => {
    const tokenService = { verifyAccessToken: vi.fn() };
    const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader('token-sem-prefixo');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token válido: popula request.user e devolve true', async () => {
    const payload = { sub: 'user-1', roles: [], scopes: [], tokenVersion: 0, deviceId: 'd1', jti: 'j1' };
    const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(payload) };
    const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context, request } = contextWithHeader('Bearer token-valido');

    expect(await guard.canActivate(context)).toBe(true);
    expect(request.user).toEqual(payload);
    expect(tokenService.verifyAccessToken).toHaveBeenCalledWith('token-valido');
  });

  it.each([
    ['expirado', new ExpiredTokenError()],
    ['revogado', new RevokedTokenError()],
    ['inválido', new InvalidTokenError('x')],
  ])('token %s: 401 uniforme (não distingue o motivo pro cliente)', async (_label, error) => {
    const tokenService = { verifyAccessToken: vi.fn().mockRejectedValue(error) };
    const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader('Bearer token-problematico');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('erro inesperado (não é dos 3 conhecidos) propaga, não vira 401 silencioso', async () => {
    const tokenService = { verifyAccessToken: vi.fn().mockRejectedValue(new Error('redis caiu')) };
    const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader('Bearer token-x');

    await expect(guard.canActivate(context)).rejects.toThrow('redis caiu');
  });

  it('abre o próprio contexto de plataforma pra verificar o token (Guards rodam antes de qualquer Interceptor)', async () => {
    const payload = { sub: 'user-1', roles: [], scopes: [], tokenVersion: 0, deviceId: 'd1', jti: 'j1' };
    const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(payload) };
    const requestContext = fakeRequestContext();
    const guard = new JwtAuthGuard(tokenService as never, requestContext as never);
    const { context } = contextWithHeader('Bearer token-valido');

    await guard.canActivate(context);

    expect(requestContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ isPlatform: true }),
      expect.any(Function),
    );
  });

  describe('impersonation somente-leitura (Épico 14)', () => {
    const readOnlyPayload = {
      sub: 'admin-1',
      roles: ['owner'],
      scopes: [],
      tokenVersion: 0,
      deviceId: 'd1',
      jti: 'j1',
      impersonation: { tenantId: 'tenant-1', readOnly: true },
    };

    it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('%s com token readOnly: 403, nunca chega no handler', async (method) => {
      const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(readOnlyPayload) };
      const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
      const { context } = contextWithHeader('Bearer token-impersonation', method);

      await expect(guard.canActivate(context)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it.each(['GET', 'HEAD', 'OPTIONS'])('%s com token readOnly: passa normal', async (method) => {
      const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(readOnlyPayload) };
      const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
      const { context } = contextWithHeader('Bearer token-impersonation', method);

      expect(await guard.canActivate(context)).toBe(true);
    });

    it('POST com token readOnly:false: passa normal (escrita liberada explicitamente)', async () => {
      const payload = { ...readOnlyPayload, impersonation: { tenantId: 'tenant-1', readOnly: false } };
      const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(payload) };
      const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
      const { context } = contextWithHeader('Bearer token-impersonation-rw', 'POST');

      expect(await guard.canActivate(context)).toBe(true);
    });

    it('POST com token NORMAL (sem claim de impersonation): passa normal — a trava só existe pra token de impersonation', async () => {
      const payload = { sub: 'user-1', roles: ['owner'], scopes: [], tokenVersion: 0, deviceId: 'd1', jti: 'j1' };
      const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(payload) };
      const guard = new JwtAuthGuard(tokenService as never, fakeRequestContext() as never);
      const { context } = contextWithHeader('Bearer token-normal', 'POST');

      expect(await guard.canActivate(context)).toBe(true);
    });
  });
});
