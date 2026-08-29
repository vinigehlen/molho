import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  CreateModifierGroupInput,
  ModifierGroupRecord,
  ModifierGroupRepository,
  ModifierGroupWithProductRecord,
  UpdateModifierGroupInput,
} from './modifier-group.repository';

export class ModifierGroupService {
  constructor(private readonly repo: ModifierGroupRepository) {}

  listByProduct(productId: string): Promise<ModifierGroupRecord[]> {
    return this.repo.listByProduct(productId);
  }

  /** Aba "Complementos" — todos os grupos do tenant, com nome do produto. */
  listAll(): Promise<ModifierGroupWithProductRecord[]> {
    return this.repo.listAll();
  }

  get(id: string): Promise<ModifierGroupRecord | null> {
    return this.repo.findById(id);
  }

  async create(input: CreateModifierGroupInput): Promise<ModifierGroupRecord> {
    this.assertValidName(input.name);
    this.assertValidRange(input.min ?? 0, input.max ?? 1);
    if (!(await this.repo.productExists(input.productId))) {
      throw new CatalogNotFoundError('Produto');
    }
    return this.repo.create(input);
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateModifierGroupInput,
  ): Promise<ModifierGroupRecord> {
    if (input.name !== undefined) this.assertValidName(input.name);
    if (input.min !== undefined || input.max !== undefined) {
      const current = await this.repo.findById(id);
      if (!current) throw new CatalogNotFoundError('Grupo de complementos');
      this.assertValidRange(input.min ?? current.min, input.max ?? current.max);
    }
    return this.repo.update(id, expectedVersion, input);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  /** Reuso (exceção MVP 2026-08-28, fase 2/4) — vincula um grupo EXISTENTE
   * a outro produto, sem duplicar o cadastro. Idempotente: linkar de novo
   * não dá erro. */
  async link(groupId: string, productId: string): Promise<void> {
    if (!(await this.repo.findById(groupId))) throw new CatalogNotFoundError('Grupo de complementos');
    if (!(await this.repo.productExists(productId))) throw new CatalogNotFoundError('Produto');
    await this.repo.linkToProduct(groupId, productId);
  }

  /** Desvincula — o grupo continua existindo (e continua valendo pros
   * outros produtos vinculados). Não impede zerar todos os vínculos de
   * propósito: um grupo sem produto nenhum só fica invisível até religar,
   * simples de propósito (ver CLAUDE.md, fase reuso). */
  async unlink(groupId: string, productId: string): Promise<void> {
    if (!(await this.repo.isLinkedToProduct(groupId, productId))) {
      throw new CatalogNotFoundError('Vínculo entre grupo e produto');
    }
    await this.repo.unlinkFromProduct(groupId, productId);
  }

  private assertValidName(name: string): void {
    if (name.trim().length === 0) {
      throw new CatalogValidationError('Nome do grupo de complementos não pode ser vazio.');
    }
  }

  private assertValidRange(min: number, max: number): void {
    if (min < 0 || min > max) {
      throw new CatalogValidationError('min precisa ser >= 0 e <= max.');
    }
  }
}
