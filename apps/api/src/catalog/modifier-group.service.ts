import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  CreateModifierGroupInput,
  ModifierGroupRecord,
  ModifierGroupRepository,
  UpdateModifierGroupInput,
} from './modifier-group.repository';

export class ModifierGroupService {
  constructor(private readonly repo: ModifierGroupRepository) {}

  listByProduct(productId: string): Promise<ModifierGroupRecord[]> {
    return this.repo.listByProduct(productId);
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
