import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { RequestContextService } from '../../context/request-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

function fakeRequestContext(overrides: { findBySlugResult?: { id: string } | null } = {}) {
  const runCalls: unknown[] = [];
  const requestContext = {
    run: vi.fn((context: unknown, fn: () => unknown) => {
      runCalls.push(context);
      return Promise.resolve(fn());
    }),
    getClient: () => ({
      tenant: {
        findFirst: vi.fn().mockResolvedValue(overrides.findBySlugResult ?? null),
      },
    }),
  };
  return { requestContext: requestContext as unknown as RequestContextService, runCalls };
}

function contextWithRequest(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

const nextHandler: CallHandler = { handle: () => of('resultado-do-handler') };

describe('TenantContextInterceptor', () => {
  it('rota pública (:slug): resolve tenant e roda com isPlatform=false', async () => {
    const { requestContext, runCalls } = fakeRequestContext({ findBySlugResult: { id: 'tenant-1' } });
    const interceptor = new TenantContextInterceptor(requestContext);
    const context = contextWithRequest({ params: { slug: 'hamburgueria-da-vila' }, headers: {} });

    const result$ = await interceptor.intercept(context, nextHandler);
    expect(await firstValueFrom(result$)).toBe('resultado-do-handler');

    // 1ª chamada a run(): resolve o slug (isPlatform=true, tenant placeholder).
    expect(runCalls[0]).toMatchObject({ isPlatform: true });
    // 2ª chamada a run(): o handler de verdade, já escopado ao tenant achado.
    expect(runCalls[1]).toEqual({ tenantId: 'tenant-1', isPlatform: false });
  });

  it('slug que não existe: 404, nunca chega a rodar o handler', async () => {
    const { requestContext } = fakeRequestContext({ findBySlugResult: null });
    const interceptor = new TenantContextInterceptor(requestContext);
    const context = contextWithRequest({ params: { slug: 'nao-existe' }, headers: {} });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rota autenticada sem X-Tenant-Id: 403', async () => {
    const { requestContext } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext);
    const context = contextWithRequest({
      params: {},
      headers: {},
      user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
    });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rota autenticada sem request.user (guard de auth não rodou antes): 401', async () => {
    const { requestContext } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext);
    const context = contextWithRequest({ params: {}, headers: { 'x-tenant-id': 'tenant-1' } });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ator SEM scope pro tenant do header: 403', async () => {
    const { requestContext } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext);
    const context = contextWithRequest({
      params: {},
      headers: { 'x-tenant-id': 'tenant-2' },
      user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
    });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ator COM scope tenant pro header certo: roda com isPlatform=false', async () => {
    const { requestContext, runCalls } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext);
    const context = contextWithRequest({
      params: {},
      headers: { 'x-tenant-id': 'tenant-1' },
      user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
    });

    const result$ = await interceptor.intercept(context, nextHandler);
    expect(await firstValueFrom(result$)).toBe('resultado-do-handler');
    expect(runCalls[0]).toEqual({ tenantId: 'tenant-1', isPlatform: false });
  });

  it('ator platform_*: roda com isPlatform=true mesmo sem scope tenant específico', async () => {
    const { requestContext, runCalls } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext);
    const context = contextWithRequest({
      params: {},
      headers: { 'x-tenant-id': 'tenant-qualquer' },
      user: { sub: 'platform-1', scopes: [{ role: 'platform_support', scopeType: 'platform', scopeId: null }] },
    });

    const result$ = await interceptor.intercept(context, nextHandler);
    await firstValueFrom(result$);
    expect(runCalls[0]).toEqual({ tenantId: 'tenant-qualquer', isPlatform: true });
  });
});
