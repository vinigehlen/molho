import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type { CatalogActor } from './catalog-actor';
import type {
  CreateProductInput,
  ProductRecord,
  ProductRepository,
  UpdateProductInput,
} from './product.repository';

export class ProductService {
  constructor(private readonly repo: ProductRepository) {}

  listByCategory(categoryId: string): Promise<ProductRecord[]> {
    return this.repo.listByCategory(categoryId);
  }

  get(id: string): Promise<ProductRecord | null> {
    return this.repo.findById(id);
  }

  async create(input: CreateProductInput): Promise<ProductRecord> {
    this.assertValidName(input.name);
    this.assertValidPrice(input.basePriceCents);
    await this.assertCategoryExists(input.categoryId);
    return this.repo.create(input);
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateProductInput,
    actor: CatalogActor,
  ): Promise<ProductRecord> {
    if (input.name !== undefined) this.assertValidName(input.name);
    if (input.basePriceCents !== undefined) this.assertValidPrice(input.basePriceCents);
    if (input.categoryId !== undefined) {
      await this.assertCategoryExists(input.categoryId);
      if (await this.repo.secondaryOfferExists(id, input.categoryId)) {
        throw new CatalogValidationError('Este produto já está disponível nesta categoria.');
      }
    }
    return this.repo.update(id, expectedVersion, input, actor);
  }

  /**
   * "Esgotado manual" (definicoes-v1 §5.4). Método dedicado, nunca update():
   * catalog.product.mark_unavailable é separada de catalog.product.update na
   * matriz (§5-C.5) — cashier marca esgotado sem poder editar preço. Manter
   * dois caminhos de escrita distintos no service é o que deixa essa
   * separação de permissão possível no controller (commit 4), sem o
   * controller precisar reimplementar a regra aqui.
   */
  setAvailable(id: string, expectedVersion: number, available: boolean): Promise<ProductRecord> {
    return this.repo.setAvailable(id, expectedVersion, available);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  private assertValidName(name: string): void {
    if (name.trim().length === 0) {
      throw new CatalogValidationError('Nome do produto não pode ser vazio.');
    }
  }

  private assertValidPrice(cents: number): void {
    if (!Number.isInteger(cents) || cents < 0) {
      throw new CatalogValidationError(
        'Preço precisa ser um inteiro em centavos, maior ou igual a zero.',
      );
    }
  }

  private async assertCategoryExists(categoryId: string): Promise<void> {
    if (!(await this.repo.categoryExists(categoryId))) {
      throw new CatalogNotFoundError('Categoria');
    }
  }
}
