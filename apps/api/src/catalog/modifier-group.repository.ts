import type { RequestContextService } from '../context/request-context.service';
import { CatalogNotFoundError } from './catalog-errors';
import { assertOptimisticUpdate } from './optimistic-update.util';

export interface ModifierGroupRecord {
  id: string;
  productId: string;
  name: string;
  min: number;
  max: number;
  /** Pausado = existe mas some pro cliente escolher (mesma ideia do produto "esgotado"). */
  active: boolean;
  pdvCode: string | null;
  version: number;
}

/** Aba "Complementos" (exceção MVP 2026-08-28) lista grupos do TENANT
 * inteiro, não de um produto só. `productNames`/`productIds` refletem TODO
 * vínculo (fase reuso — `product_modifier_groups`, não só o dono original). */
export interface ModifierGroupWithProductRecord extends ModifierGroupRecord {
  productNames: string[];
  productIds: string[];
}

export interface CreateModifierGroupInput {
  productId: string;
  name: string;
  min?: number;
  max?: number;
  pdvCode?: string | null;
}

export interface UpdateModifierGroupInput {
  name?: string;
  min?: number;
  max?: number;
  active?: boolean;
  pdvCode?: string | null;
}

export interface ModifierGroupRepository {
  /** Grupos que VALEM pra este produto — dono original + vínculos extra
   * (product_modifier_groups). Nunca lê `modifierGroup.productId` direto:
   * depois do backfill da fase reuso, essa tabela é a única fonte de verdade
   * de "quais grupos aparecem em qual produto". */
  listByProduct(productId: string): Promise<ModifierGroupRecord[]>;
  /** Todos os grupos do tenant (aba Complementos), com os produtos onde valem. */
  listAll(): Promise<ModifierGroupWithProductRecord[]>;
  findById(id: string): Promise<ModifierGroupRecord | null>;
  productExists(productId: string): Promise<boolean>;
  /** Grupo já vinculado a este produto (evita vínculo duplicado / valida antes de desvincular). */
  isLinkedToProduct(groupId: string, productId: string): Promise<boolean>;
  /** Vincula um grupo EXISTENTE a outro produto — idempotente, não faz nada se já vinculado. */
  linkToProduct(groupId: string, productId: string): Promise<void>;
  /** Desvincula (soft delete só do vínculo) — o grupo em si continua existindo. */
  unlinkFromProduct(groupId: string, productId: string): Promise<void>;
  /** Produtos ligados ao grupo, usados para bloquear uma separação sem reuso. */
  listLinkedProductIds(groupId: string): Promise<string[]>;
  /** Clona grupo + opções e substitui o vínculo do produto escolhido. */
  copyForProduct(groupId: string, productId: string): Promise<ModifierGroupRecord>;
  create(input: CreateModifierGroupInput): Promise<ModifierGroupRecord>;
  update(id: string, expectedVersion: number, input: UpdateModifierGroupInput): Promise<ModifierGroupRecord>;
  softDelete(id: string, expectedVersion: number): Promise<void>;
}

const SELECT = {
  id: true,
  productId: true,
  name: true,
  min: true,
  max: true,
  active: true,
  pdvCode: true,
  version: true,
} as const;

export class PrismaModifierGroupRepository implements ModifierGroupRepository {
  constructor(private readonly requestContext: RequestContextService) {}

  async listByProduct(productId: string): Promise<ModifierGroupRecord[]> {
    const links = await this.requestContext.getClient().productModifierGroup.findMany({
      where: { productId, deletedAt: null, modifierGroup: { deletedAt: null } },
      select: { modifierGroup: { select: SELECT } },
    });
    return links.map((link) => link.modifierGroup);
  }

  async listAll(): Promise<ModifierGroupWithProductRecord[]> {
    const links = await this.requestContext.getClient().productModifierGroup.findMany({
      where: { deletedAt: null, product: { deletedAt: null }, modifierGroup: { deletedAt: null } },
      select: {
        productId: true,
        product: { select: { name: true } },
        modifierGroup: { select: SELECT },
      },
      orderBy: { modifierGroup: { name: 'asc' } },
    });
    const byGroup = new Map<string, ModifierGroupWithProductRecord>();
    for (const link of links) {
      const existing = byGroup.get(link.modifierGroup.id);
      if (existing) {
        existing.productNames.push(link.product.name);
        existing.productIds.push(link.productId);
        continue;
      }
      byGroup.set(link.modifierGroup.id, {
        ...link.modifierGroup,
        productNames: [link.product.name],
        productIds: [link.productId],
      });
    }
    return [...byGroup.values()];
  }

  async findById(id: string): Promise<ModifierGroupRecord | null> {
    return this.requestContext
      .getClient()
      .modifierGroup.findFirst({ where: { id, deletedAt: null }, select: SELECT });
  }

  async productExists(productId: string): Promise<boolean> {
    const product = await this.requestContext
      .getClient()
      .product.findFirst({ where: { id: productId, deletedAt: null }, select: { id: true } });
    return product !== null;
  }

  async isLinkedToProduct(groupId: string, productId: string): Promise<boolean> {
    const link = await this.requestContext.getClient().productModifierGroup.findFirst({
      where: { modifierGroupId: groupId, productId, deletedAt: null },
      select: { id: true },
    });
    return link !== null;
  }

  async linkToProduct(groupId: string, productId: string): Promise<void> {
    if (await this.isLinkedToProduct(groupId, productId)) return;
    await this.requestContext.getClient().productModifierGroup.create({
      data: { tenantId: this.requestContext.getTenantId(), productId, modifierGroupId: groupId },
    });
  }

  async unlinkFromProduct(groupId: string, productId: string): Promise<void> {
    await this.requestContext.getClient().productModifierGroup.updateMany({
      where: { modifierGroupId: groupId, productId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
  }

  async listLinkedProductIds(groupId: string): Promise<string[]> {
    const links = await this.requestContext.getClient().productModifierGroup.findMany({
      where: { modifierGroupId: groupId, deletedAt: null },
      select: { productId: true },
    });
    return links.map((link) => link.productId);
  }

  async copyForProduct(groupId: string, productId: string): Promise<ModifierGroupRecord> {
    const client = this.requestContext.getClient();
    const source = await client.modifierGroup.findFirst({
      where: { id: groupId, deletedAt: null },
      select: {
        ...SELECT,
        modifiers: {
          where: { deletedAt: null },
          orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
          select: {
            name: true,
            description: true,
            imageKey: true,
            priceDeltaCents: true,
            active: true,
            pdvCode: true,
            sortOrder: true,
          },
        },
      },
    });
    if (!source) throw new CatalogNotFoundError('Grupo de complementos');

    const suffix = ' (cópia)';
    const created = await client.modifierGroup.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        productId,
        name: `${source.name.slice(0, 80 - suffix.length)}${suffix}`,
        min: source.min,
        max: source.max,
        active: source.active,
        pdvCode: source.pdvCode,
      },
      select: SELECT,
    });
    await client.productModifierGroup.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        productId,
        modifierGroupId: created.id,
      },
    });
    if (source.modifiers.length > 0) {
      await client.modifier.createMany({
        data: source.modifiers.map((modifier) => ({
          tenantId: this.requestContext.getTenantId(),
          groupId: created.id,
          ...modifier,
        })),
      });
    }
    await client.productModifierGroup.updateMany({
      where: { modifierGroupId: groupId, productId, deletedAt: null },
      data: { deletedAt: new Date() },
    });
    return created;
  }

  async create(input: CreateModifierGroupInput): Promise<ModifierGroupRecord> {
    const client = this.requestContext.getClient();
    const created = await client.modifierGroup.create({
      data: {
        tenantId: this.requestContext.getTenantId(),
        productId: input.productId,
        name: input.name,
        min: input.min ?? 0,
        max: input.max ?? 1,
        pdvCode: input.pdvCode ?? null,
      },
      select: SELECT,
    });
    // Grupo nasce vinculado ao produto que o criou — mesma transação do
    // request (RequestContextService.run()), então as duas escritas são
    // atômicas juntas sem precisar de $transaction explícito.
    await client.productModifierGroup.create({
      data: { tenantId: this.requestContext.getTenantId(), productId: input.productId, modifierGroupId: created.id },
    });
    return created;
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateModifierGroupInput,
  ): Promise<ModifierGroupRecord> {
    const client = this.requestContext.getClient();
    const result = await client.modifierGroup.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { ...input, version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Grupo de complementos', result.count, async () => (await this.findById(id)) !== null);
    return this.findByIdOrThrow(id);
  }

  async softDelete(id: string, expectedVersion: number): Promise<void> {
    const client = this.requestContext.getClient();
    const result = await client.modifierGroup.updateMany({
      where: { id, version: expectedVersion, deletedAt: null },
      data: { deletedAt: new Date(), version: { increment: 1 } },
    });
    await assertOptimisticUpdate('Grupo de complementos', result.count, async () => (await this.findById(id)) !== null);
  }

  private async findByIdOrThrow(id: string): Promise<ModifierGroupRecord> {
    const record = await this.findById(id);
    if (!record) throw new CatalogNotFoundError('Grupo de complementos');
    return record;
  }
}
