import type { RequestContextService } from '../context/request-context.service';

/**
 * Resolver slug->tenantId é busca CROSS-TENANT por natureza (não dá pra
 * saber o app.tenant_id certo antes de já ter achado o tenant) — por isso
 * quem chama isto precisa envolver a chamada num
 * requestContext.run({ isPlatform: true, ... }), nunca num contexto
 * já escopado a um tenant específico.
 */
export class TenantLookupRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async findBySlug(slug: string): Promise<{ id: string } | null> {
    return this.requestContext.getClient().tenant.findFirst({
      where: { slug, deletedAt: null },
      select: { id: true },
    });
  }
}
