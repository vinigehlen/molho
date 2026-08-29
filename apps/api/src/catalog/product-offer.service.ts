import type { CatalogActor } from './catalog-actor';
import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  ProductOfferFilter,
  ProductOfferRecord,
  ProductOfferRepository,
  UpdateProductOfferInput,
} from './product-offer.repository';

export class ProductOfferService {
  constructor(private readonly repo: ProductOfferRepository) {}

  list(filter: ProductOfferFilter): Promise<ProductOfferRecord[]> {
    return this.repo.list(filter);
  }

  get(id: string): Promise<ProductOfferRecord | null> {
    return this.repo.findById(id);
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateProductOfferInput,
    actor: CatalogActor,
  ): Promise<ProductOfferRecord> {
    if (input.priceCents !== undefined) this.assertValidPrice(input.priceCents);
    if (input.categoryId !== undefined) await this.assertCategoryExists(input.categoryId);
    return this.repo.update(id, expectedVersion, input, actor);
  }

  setAvailable(
    id: string,
    expectedVersion: number,
    available: boolean,
  ): Promise<ProductOfferRecord> {
    return this.repo.setAvailable(id, expectedVersion, available);
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
