import type { StoreSummary } from '@molho/contracts';
import type { RequestContextService } from '../context/request-context.service';

export class StoreAdminRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async list(tenantId: string): Promise<StoreSummary[]> {
    const client = this.requestContext.getClient();
    const rows = await client.store.findMany({
      where: { tenantId, deletedAt: null },
      select: { id: true, name: true, slug: true, isPrimary: true, addressText: true, timezone: true, createdAt: true },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({ ...r, createdAt: r.createdAt.toISOString() }));
  }

  /** `isPrimary` nunca nasce aqui — só a primeira loja do tenant (signup/platform provisioning) ganha `true`. */
  async create(tenantId: string, data: { name: string; slug: string; addressText: string; timezone: string }): Promise<StoreSummary> {
    const client = this.requestContext.getClient();
    const store = await client.store.create({
      data: { tenantId, name: data.name, slug: data.slug, addressText: data.addressText, timezone: data.timezone, isPrimary: false },
      select: { id: true, name: true, slug: true, isPrimary: true, addressText: true, timezone: true, createdAt: true },
    });
    return { ...store, createdAt: store.createdAt.toISOString() };
  }
}
