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
    if (!(await this.repo.groupExists(input.groupId))) {
      throw new CatalogNotFoundError('Grupo de complementos');
    }
    return this.repo.create(input);
  }

  // async: sem isso, o throw síncrono de assertValidName/assertValidPriceDelta
  // escaparia da chamada em vez de rejeitar a Promise (mesmo achado do
  // CategoryService — ver comentário lá).
  async update(id: string, expectedVersion: number, input: UpdateModifierInput): Promise<ModifierRecord> {
    if (input.name !== undefined) this.assertValidName(input.name);
    if (input.priceDeltaCents !== undefined) this.assertValidPriceDelta(input.priceDeltaCents);
    return this.repo.update(id, expectedVersion, input);
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
}
