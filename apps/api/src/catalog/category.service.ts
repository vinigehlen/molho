import type {
  CategoryRecord,
  CategoryRepository,
  CreateCategoryInput,
  UpdateCategoryInput,
} from './category.repository';
import { CatalogValidationError } from './catalog-errors';

export class CategoryService {
  constructor(private readonly repo: CategoryRepository) {}

  list(): Promise<CategoryRecord[]> {
    return this.repo.list();
  }

  get(id: string): Promise<CategoryRecord | null> {
    return this.repo.findById(id);
  }

  /** Casamento case-insensitive — usado pela importação por planilha (catalog-import.service.ts). */
  getByName(name: string): Promise<CategoryRecord | null> {
    return this.repo.findByName(name);
  }

  // async mesmo sem await interno: assertValidName lança de forma síncrona,
  // e sem async esse throw escapa direto da chamada em vez de rejeitar a
  // Promise — quem chama com `.catch()`/`await/try` esperaria uma rejeição,
  // não uma exceção síncrona no meio da expressão (achado escrevendo o
  // teste: `expect(service.create(...)).rejects.toThrow(...)` nunca chegava
  // a montar a expectation, o throw acontecia antes).
  async create(input: CreateCategoryInput): Promise<CategoryRecord> {
    this.assertValidName(input.name);
    return this.repo.create(input);
  }

  async update(id: string, expectedVersion: number, input: UpdateCategoryInput): Promise<CategoryRecord> {
    if (input.name !== undefined) this.assertValidName(input.name);
    return this.repo.update(id, expectedVersion, input);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  private assertValidName(name: string): void {
    if (name.trim().length === 0) {
      throw new CatalogValidationError('Nome da categoria não pode ser vazio.');
    }
  }
}
