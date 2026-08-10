import type { ExecutionContext } from '@nestjs/common';
import { UnauthorizedException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { ExpiredTokenError, InvalidTokenError, RevokedTokenError } from '../token/token-errors';
import { CustomerJwtAuthGuard } from './customer-jwt-auth.guard';
import { OptionalCustomerJwtAuthGuard } from './optional-customer-jwt-auth.guard';

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

function buildGuard(verifyAccessToken: ReturnType<typeof vi.fn>) {
  const strict = new CustomerJwtAuthGuard({ verifyAccessToken } as never, fakeRequestContext() as never);
  return new OptionalCustomerJwtAuthGuard(strict);
}

/**
 * A fronteira que o checkout guest NÃO pode afrouxar (CLAUDE.md regra 13,
 * EMENDA): ausência de header é anonimato legítimo; header presente e ruim é
 * 401, jamais um rebaixamento silencioso pro caminho sem OTP.
 */
describe('OptionalCustomerJwtAuthGuard', () => {
  it('sem header Authorization: passa como ANÔNIMO, sem tocar no token service', async () => {
    const verifyAccessToken = vi.fn();
    const { context, request } = contextWithHeader(undefined);

    // Síncrono de propósito: sem header não há nada a verificar, então nem
    // uma Promise se cria.
    expect(buildGuard(verifyAccessToken).canActivate(context)).toBe(true);
    expect(request.user).toBeUndefined();
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('token válido: popula request.user, exatamente como o guard estrito', async () => {
    const payload = { sub: 'customer-1', roles: [], scopes: [], tokenVersion: 0, deviceId: 'd1', jti: 'j1' };
    const { context, request } = contextWithHeader('Bearer token-valido');

    await expect(buildGuard(vi.fn().mockResolvedValue(payload)).canActivate(context)).resolves.toBe(true);
    expect(request.user).toEqual(payload);
  });

  for (const [nome, erro] of [
    ['inválido', new InvalidTokenError()],
    ['expirado', new ExpiredTokenError()],
    ['revogado', new RevokedTokenError()],
  ] as const) {
    it(`token ${nome}: 401 e NUNCA cai pro caminho guest`, async () => {
      const { context, request } = contextWithHeader('Bearer token-ruim');

      await expect(buildGuard(vi.fn().mockRejectedValue(erro)).canActivate(context)).rejects.toBeInstanceOf(
        UnauthorizedException,
      );
      expect(request.user).toBeUndefined();
    });
  }

  it('header malformado (sem "Bearer "): 401 — presença do header já é uma afirmação de identidade', async () => {
    const verifyAccessToken = vi.fn();
    const { context } = contextWithHeader('token-sem-prefixo');

    await expect(buildGuard(verifyAccessToken).canActivate(context)).rejects.toBeInstanceOf(UnauthorizedException);
    expect(verifyAccessToken).not.toHaveBeenCalled();
  });

  it('header vazio conta como AUSENTE — string vazia não afirma identidade nenhuma', async () => {
    const { context, request } = contextWithHeader('');

    expect(buildGuard(vi.fn()).canActivate(context)).toBe(true);
    expect(request.user).toBeUndefined();
  });
});
