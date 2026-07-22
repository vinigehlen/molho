import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExpiredTokenError, InvalidTokenError, RevokedTokenError } from '../token/token-errors';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';

function contextWithHeader(authorization: string | undefined) {
  const request: { headers: Record<string, string | undefined>; user?: unknown } = {
    headers: authorization === undefined ? {} : { authorization },
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

describe('CustomerJwtAuthGuard', () => {
  it('sem header Authorization: 401', async () => {
    const tokenService = { verifyAccessToken: vi.fn() };
    const guard = new CustomerJwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader(undefined);

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(tokenService.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('header sem "Bearer ": 401', async () => {
    const tokenService = { verifyAccessToken: vi.fn() };
    const guard = new CustomerJwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader('token-sem-prefixo');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('token válido: popula request.user (customerId em sub) e devolve true', async () => {
    const payload = { sub: 'customer-1', roles: [], scopes: [], tokenVersion: 0, deviceId: 'd1', jti: 'j1' };
    const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(payload) };
    const guard = new CustomerJwtAuthGuard(tokenService as never, fakeRequestContext() as never);
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
    const guard = new CustomerJwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader('Bearer token-problematico');

    await expect(guard.canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('erro inesperado (não é dos 3 conhecidos) propaga, não vira 401 silencioso', async () => {
    const tokenService = { verifyAccessToken: vi.fn().mockRejectedValue(new Error('redis caiu')) };
    const guard = new CustomerJwtAuthGuard(tokenService as never, fakeRequestContext() as never);
    const { context } = contextWithHeader('Bearer token-x');

    await expect(guard.canActivate(context)).rejects.toThrow('redis caiu');
  });

  it('abre o próprio contexto de plataforma pra verificar o token (Guards rodam antes de qualquer Interceptor)', async () => {
    const payload = { sub: 'customer-1', roles: [], scopes: [], tokenVersion: 0, deviceId: 'd1', jti: 'j1' };
    const tokenService = { verifyAccessToken: vi.fn().mockResolvedValue(payload) };
    const requestContext = fakeRequestContext();
    const guard = new CustomerJwtAuthGuard(tokenService as never, requestContext as never);
    const { context } = contextWithHeader('Bearer token-valido');

    await guard.canActivate(context);

    expect(requestContext.run).toHaveBeenCalledWith(
      expect.objectContaining({ isPlatform: true }),
      expect.any(Function),
    );
  });
});
