import type { Prisma } from '@molho/db';

/** Igual a `nextAvailableSlug` (platform/tenant-slug.util.ts), mas único por TENANT, não globalmente — mesmo índice parcial (tenant_id, slug) WHERE deleted_at IS NULL. */
export async function nextAvailableStoreSlug(client: Prisma.TransactionClient, tenantId: string, base: string): Promise<string> {
  for (let i = 0; i < 50; i += 1) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const existing = await client.store.findFirst({
      where: { tenantId, slug: candidate, deletedAt: null },
      select: { id: true },
    });
    if (!existing) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`;
}
