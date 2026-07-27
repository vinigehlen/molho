import { firstTenantScopeId, subFromToken } from './jwt-tenant';
import { setStaffSession } from './staff-session';

/**
 * ATALHO DE AUTH SÓ-DEV (débito registrado em docs/07, gatilho de remoção:
 * Épico 9b — login real de staff). NÃO é bypass da validação: obtém um JWT
 * REAL dirigindo o fluxo OTP de verdade do Épico 3 (`/v1/auth/otp`). Existe só
 * porque o login de staff no backoffice ainda não foi construído.
 *
 * Lança em tempo de IMPORT quando carregado num BROWSER de produção — falha
 * barulhenta, nunca degradação silenciosa. O guard checa `window` de propósito:
 * durante `next build`/SSR (server, sem window) não lança — senão quebraria o
 * build inteiro em vez de só o carregamento indevido; no browser de produção
 * (onde o atalho de auth seria de fato perigoso) lança na hora que o chunk
 * avalia.
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'development') {
  throw new Error(
    'dev-only-auth carregado num browser de produção — é um atalho de auth SÓ pra dev (docs/07). Nunca deve ser servido em produção.',
  );
}

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3333';

/** Owner do seed (packages/db/prisma/seed) — tem user_role('owner') no tenant, então o token vem com order.view. */
export const DEV_SEED_OWNER = { phone: '+5551999990000', tenantSlug: 'hamburgueria-da-vila' } as const;

/** Dispara o OTP real. Em dev o MockMessagingProvider LOGA o código no console da API (nunca vaza por endpoint — o fator de posse é preservado). */
export async function devRequestOtp(phone: string): Promise<void> {
  const res = await fetch(`${API_URL}/v1/auth/otp/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone }),
  });
  if (!res.ok && res.status !== 202) throw new Error(`Falha ao pedir OTP (${res.status})`);
}

/** Verifica o código, grava a sessão de staff com o JWT real + o tenant extraído do próprio token. */
export async function devVerifyOtp(phone: string, code: string): Promise<{ name: string }> {
  const res = await fetch(`${API_URL}/v1/auth/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone, code }),
  });
  if (!res.ok) throw new Error(`Código inválido ou expirado (${res.status})`);
  const body = (await res.json()) as { accessToken: string; user: { name: string } };

  const tenantId = firstTenantScopeId(body.accessToken);
  if (!tenantId) throw new Error('Token sem escopo de tenant — o owner do seed tem user_role? Rode o seed.');
  const userId = subFromToken(body.accessToken);
  if (!userId) throw new Error('Token sem sub.');

  setStaffSession({ accessToken: body.accessToken, tenantId, userId });
  return { name: body.user.name };
}
