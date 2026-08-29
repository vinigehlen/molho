import type { Prisma } from '@molho/db';

/**
 * Garante tamanho mínimo (3) e teto de URL (30) — decisão de CRIAÇÃO/RENOMEIO
 * de tenant, não do preview puro (`slugifyStoreName`, @molho/contracts).
 * Compartilhado entre signup (Bloco 2) e rename de loja na configuração
 * (nome fantasia → domínio sempre sincronizados, decisão de produto).
 */
export function normalizeSlugForCreation(slug: string): string {
  const trimmed = slug.slice(0, 30).replace(/-+$/g, '');
  return trimmed.length >= 3 ? trimmed : `loja-${trimmed || 'molho'}`.slice(0, 30);
}

/**
 * Próximo slug livre a partir de `base` (`-2`, `-3`, ... em caso de
 * colisão). `excludeTenantId` ignora a própria linha do tenant sendo
 * renomeado — sem isso, salvar o MESMO nome de novo (candidate === slug
 * atual do próprio tenant) "colidiria" com ele mesmo e geraria um `-2`
 * espúrio a cada save.
 */
export async function nextAvailableSlug(
  client: Prisma.TransactionClient,
  base: string,
  excludeTenantId?: string,
): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await client.tenant.findFirst({
      where: { slug: candidate, deletedAt: null, ...(excludeTenantId ? { id: { not: excludeTenantId } } : {}) },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
