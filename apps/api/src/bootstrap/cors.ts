import type { INestApplication } from '@nestjs/common';

const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:3001'];

/**
 * Origens permitidas (exatas). Produção: `MOLHO_CORS_ORIGINS` (lista separada
 * por vírgula, ex.: `https://app.molho.live`). Sem a var (dev): fronts locais.
 *
 * Allowlist de valores EXATOS, nunca regex nem eco cego do `Origin` — é o que
 * segura a superfície same-site do Épico 9: um storefront `{slug}.molho.live`
 * ou um preview `*.vercel.app` que tente ler o stream com credenciais é
 * barrado aqui, porque a origem dele não está na lista (o cors só reflete de
 * volta origens que casam EXATAMENTE com um item, então `credentials: true`
 * nunca vira o curinga inválido). Staging entra adicionando a origem à var,
 * não afrouxando a regra.
 */
export function parseCorsOrigins(raw: string | undefined): string[] {
  if (!raw) return DEV_ORIGINS;
  const origins = raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
  return origins.length > 0 ? origins : DEV_ORIGINS;
}

/**
 * CORS COM CREDENCIAIS — mudança de semântica do Épico 9: o stream SSE precisa
 * de `credentials: true` pro cookie `__Host-molho_stream` viajar cross-origin
 * same-site (`app.molho.live` → `api.molho.live`). Com credenciais, o browser
 * EXIGE origem exata na resposta (curinga é inválido) — por isso a allowlist.
 *
 * Mora aqui, não no `main.ts`, pelo mesmo motivo de `configureTrustProxy`:
 * `Test.createTestingModule()` não roda o bootstrap, e a lógica de parsing da
 * env precisa ser testável sem subir o app.
 */
export function configureCors(app: INestApplication): void {
  app.enableCors({
    origin: parseCorsOrigins(process.env.MOLHO_CORS_ORIGINS),
    credentials: true,
  });
}
