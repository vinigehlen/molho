import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { ForbiddenException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { firstValueFrom, of } from 'rxjs';
import { describe, expect, it, vi } from 'vitest';
import type { RequestContextService } from '../../context/request-context.service';
import { TenantContextInterceptor } from './tenant-context.interceptor';

/** Tenant "saudável" por padrão — serve TANTO pro lookup de slug (só lê `.id`) QUANTO pro check de assinatura (Épico 13d), pra não quebrar os testes que não são sobre suspensão. */
const HEALTHY_TENANT = {
  id: 'tenant-1',
  status: 'active',
  trialEndsAt: null,
  currentPeriodEndsAt: null,
  pastDueAt: null,
  planId: 'standard',
  canceledAt: null,
};

function fakeRequestContext(overrides: { tenantRow?: Record<string, unknown> | null } = {}) {
  const runCalls: unknown[] = [];
  const requestContext = {
    run: vi.fn((context: unknown, fn: () => unknown) => {
      runCalls.push(context);
      return Promise.resolve(fn());
    }),
    getClient: () => ({
      tenant: {
        findFirst: vi.fn().mockResolvedValue(overrides.tenantRow ?? null),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
    }),
  };
  return { requestContext: requestContext as unknown as RequestContextService, runCalls };
}

/** `getAllAndOverride` sempre `undefined` (sem @AllowWhileSuspended), a não ser que o teste passe `allowWhileSuspended: true`. */
function fakeReflector(allowWhileSuspended?: boolean) {
  return { getAllAndOverride: vi.fn().mockReturnValue(allowWhileSuspended) } as unknown as Reflector;
}

function contextWithRequest(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as unknown as ExecutionContext;
}

const nextHandler: CallHandler = { handle: () => of('resultado-do-handler') };

/**
 * O check de assinatura (Épico 13d) roda DENTRO do callback passado a
 * `requestContext.run()`, então o erro só aparece quando o Observable
 * devolvido por `intercept()` é de fato SUBSCRITO (`firstValueFrom`) — não
 * na promise de `intercept()` em si, que já resolveu pro Observable antes
 * disso (mesmo padrão de erro vindo de dentro de `next.handle()`).
 */
async function interceptAndSubscribe(interceptor: TenantContextInterceptor, context: ExecutionContext, next: CallHandler) {
  const result$ = await interceptor.intercept(context, next);
  return firstValueFrom(result$);
}

describe('TenantContextInterceptor', () => {
  it('rota pública (:slug): resolve tenant e roda com isPlatform=false', async () => {
    const { requestContext, runCalls } = fakeRequestContext({ tenantRow: HEALTHY_TENANT });
    const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
    const context = contextWithRequest({ params: { slug: 'hamburgueria-da-vila' }, headers: {} });

    const result$ = await interceptor.intercept(context, nextHandler);
    expect(await firstValueFrom(result$)).toBe('resultado-do-handler');

    // 1ª chamada a run(): resolve o slug (isPlatform=true, tenant placeholder).
    expect(runCalls[0]).toMatchObject({ isPlatform: true });
    // 2ª chamada a run(): o handler de verdade, já escopado ao tenant achado.
    expect(runCalls[1]).toEqual({ tenantId: 'tenant-1', isPlatform: false });
  });

  it('slug que não existe: 404, nunca chega a rodar o handler', async () => {
    const { requestContext } = fakeRequestContext({ tenantRow: null });
    const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
    const context = contextWithRequest({ params: { slug: 'nao-existe' }, headers: {} });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('rota autenticada sem X-Tenant-Id: 403', async () => {
    const { requestContext } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
    const context = contextWithRequest({
      params: {},
      headers: {},
      user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
    });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rota autenticada sem request.user (guard de auth não rodou antes): 401', async () => {
    const { requestContext } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
    const context = contextWithRequest({ params: {}, headers: { 'x-tenant-id': 'tenant-1' } });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('ator SEM scope pro tenant do header: 403', async () => {
    const { requestContext } = fakeRequestContext();
    const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
    const context = contextWithRequest({
      params: {},
      headers: { 'x-tenant-id': 'tenant-2' },
      user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
    });

    await expect(interceptor.intercept(context, nextHandler)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('ator COM scope tenant pro header certo: roda com isPlatform=false', async () => {
    const { requestContext, runCalls } = fakeRequestContext({ tenantRow: HEALTHY_TENANT });
    const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
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
    const { requestContext, runCalls } = fakeRequestContext({ tenantRow: HEALTHY_TENANT });
    const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
    const context = contextWithRequest({
      params: {},
      headers: { 'x-tenant-id': 'tenant-qualquer' },
      user: { sub: 'platform-1', scopes: [{ role: 'platform_support', scopeType: 'platform', scopeId: null }] },
    });

    const result$ = await interceptor.intercept(context, nextHandler);
    await firstValueFrom(result$);
    expect(runCalls[0]).toEqual({ tenantId: 'tenant-qualquer', isPlatform: true });
  });

  describe('bloqueio de assinatura (Épico 13d)', () => {
    it('backoffice, ator NÃO-plataforma, tenant suspended: 403, nunca chega a rodar o handler', async () => {
      const { requestContext } = fakeRequestContext({ tenantRow: { ...HEALTHY_TENANT, status: 'suspended' } });
      const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
      const context = contextWithRequest({
        params: {},
        headers: { 'x-tenant-id': 'tenant-1' },
        user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
      });

      await expect(interceptAndSubscribe(interceptor, context, nextHandler)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('backoffice, ator NÃO-plataforma, tenant canceled: 403 também (mesma família de bloqueio)', async () => {
      const { requestContext } = fakeRequestContext({ tenantRow: { ...HEALTHY_TENANT, status: 'canceled' } });
      const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
      const context = contextWithRequest({
        params: {},
        headers: { 'x-tenant-id': 'tenant-1' },
        user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
      });

      await expect(interceptAndSubscribe(interceptor, context, nextHandler)).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('storefront (:slug), tenant suspended: 404 — MESMA mensagem de slug desconhecido, nunca revela que a loja existiu', async () => {
      const { requestContext } = fakeRequestContext({ tenantRow: { ...HEALTHY_TENANT, status: 'suspended' } });
      const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
      const context = contextWithRequest({ params: { slug: 'loja-suspensa' }, headers: {} });

      await expect(interceptAndSubscribe(interceptor, context, nextHandler)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('backoffice, ator DE PLATAFORMA, tenant suspended: passa — super-admin precisa conseguir entrar pra resolver', async () => {
      const { requestContext, runCalls } = fakeRequestContext({ tenantRow: { ...HEALTHY_TENANT, status: 'suspended' } });
      const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
      const context = contextWithRequest({
        params: {},
        headers: { 'x-tenant-id': 'tenant-1' },
        user: { sub: 'admin-1', scopes: [{ role: 'platform.superadmin', scopeType: 'platform', scopeId: null }] },
      });

      const result$ = await interceptor.intercept(context, nextHandler);
      expect(await firstValueFrom(result$)).toBe('resultado-do-handler');
      expect(runCalls[0]).toEqual({ tenantId: 'tenant-1', isPlatform: true });
    });

    it('rota com @AllowWhileSuspended, tenant suspended: passa mesmo pra ator não-plataforma', async () => {
      const { requestContext } = fakeRequestContext({ tenantRow: { ...HEALTHY_TENANT, status: 'suspended' } });
      const interceptor = new TenantContextInterceptor(requestContext, fakeReflector(true));
      const context = contextWithRequest({
        params: {},
        headers: { 'x-tenant-id': 'tenant-1' },
        user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
      });

      const result$ = await interceptor.intercept(context, nextHandler);
      expect(await firstValueFrom(result$)).toBe('resultado-do-handler');
    });

    it('past_due (aviso, não bloqueio): passa normal, sem exceção nenhuma', async () => {
      const { requestContext } = fakeRequestContext({ tenantRow: { ...HEALTHY_TENANT, status: 'past_due', pastDueAt: new Date() } });
      const interceptor = new TenantContextInterceptor(requestContext, fakeReflector());
      const context = contextWithRequest({
        params: {},
        headers: { 'x-tenant-id': 'tenant-1' },
        user: { sub: 'user-1', scopes: [{ role: 'owner', scopeType: 'tenant', scopeId: 'tenant-1' }] },
      });

      const result$ = await interceptor.intercept(context, nextHandler);
      expect(await firstValueFrom(result$)).toBe('resultado-do-handler');
    });
  });
});
