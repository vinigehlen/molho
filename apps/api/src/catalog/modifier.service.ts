import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type { CreateModifierInput, ModifierRecord, ModifierRepository, UpdateModifierInput } from './modifier.repository';

export class ModifierService {
  constructor(private readonly repo: ModifierRepository) {}

  listByGroup(groupId: string): Promise<ModifierRecord[]> {
    return this.repo.listByGroup(groupId);
  }

  get(id: string): Promise<ModifierRecord | null> {
    return this.repo.findById(id);
  }

  async create(input: CreateModifierInput): Promise<ModifierRecord> {
    this.assertValidName(input.name);
    this.assertValidPriceDelta(input.priceDeltaCents);
    if (input.sortOrder !== undefined) this.assertValidSortOrder(input.sortOrder);
    if (!(await this.repo.groupExists(input.groupId))) {
      throw new CatalogNotFoundError('Grupo de complementos');
    }
    const sortOrder = input.sortOrder ?? (await this.repo.maxSortOrder(input.groupId)) + 1;
    return this.repo.create({ ...input, sortOrder });
  }

  // async: sem isso, o throw síncrono de assertValidName/assertValidPriceDelta
  // escaparia da chamada em vez de rejeitar a Promise (mesmo achado do
  // CategoryService — ver comentário lá).
  async update(id: string, expectedVersion: number, input: UpdateModifierInput): Promise<ModifierRecord> {
    if (input.name !== undefined) this.assertValidName(input.name);
    if (input.priceDeltaCents !== undefined) this.assertValidPriceDelta(input.priceDeltaCents);
    if (input.sortOrder !== undefined) this.assertValidSortOrder(input.sortOrder);
    return this.repo.update(id, expectedVersion, input);
  }

  async reorder(groupId: string, items: Array<{ id: string; version: number }>): Promise<ModifierRecord[]> {
    if (new Set(items.map((item) => item.id)).size !== items.length) {
      throw new CatalogValidationError('Cada complemento pode aparecer uma vez na ordenação.');
    }
    const current = await this.repo.listByGroup(groupId);
    const currentIds = new Set(current.map((item) => item.id));
    if (current.length !== items.length || items.some((item) => !currentIds.has(item.id))) {
      throw new CatalogValidationError('A ordenação precisa incluir todos os complementos do grupo.');
    }
    return this.repo.reorder(groupId, items);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  private assertValidName(name: string): void {
    if (name.trim().length === 0) {
      throw new CatalogValidationError('Nome do complemento não pode ser vazio.');
    }
  }

  /** Sempre >= 0 — complemento nunca reduz o preço base (mesma regra do CHECK na migration). */
  private assertValidPriceDelta(cents: number): void {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new CatalogValidationError('price_delta_cents precisa ser um inteiro >= 0.');
    }
  }

  private assertValidSortOrder(value: number): void {
    if (!Number.isInteger(value) || value < 0) {
      throw new CatalogValidationError('sort_order precisa ser um inteiro não negativo.');
    }
  }
}
