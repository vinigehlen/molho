import { slugifyStoreName, type CreateStoreInput, type StoreSummary } from '@molho/contracts';
import { normalizeSlugForCreation } from '../platform/tenant-slug.util';
import type { RequestContextService } from '../context/request-context.service';
import type { StoreAdminRepository } from './store-admin.repository';
import { nextAvailableStoreSlug } from './store-slug.util';

/** V1 do multi_store (PR1 backend+admin) — criar/listar loja do tenant. Papel por loja (`UserRole.scopeType='store'`) e o seletor de loja no backoffice ficam nos próximos commits deste mesmo PR. */
export class StoreAdminService {
  constructor(
    private readonly repo: StoreAdminRepository,
    private readonly requestContext: RequestContextService,
  ) {}

  list(tenantId: string): Promise<StoreSummary[]> {
    return this.repo.list(tenantId);
  }

  async create(input: CreateStoreInput, tenantId: string): Promise<StoreSummary> {
    const client = this.requestContext.getClient();
    const slug = await nextAvailableStoreSlug(client, tenantId, normalizeSlugForCreation(slugifyStoreName(input.name)));
    return this.repo.create(tenantId, { name: input.name.trim(), slug, addressText: input.addressText.trim(), timezone: input.timezone });
  }
}
