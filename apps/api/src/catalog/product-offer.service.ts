import type { CatalogActor } from './catalog-actor';
import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  CreateProductOfferInput,
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

  async create(input: CreateProductOfferInput, actor: CatalogActor): Promise<ProductOfferRecord> {
    this.assertValidPrice(input.priceCents);
    if (!(await this.repo.productExists(input.productId))) throw new CatalogNotFoundError('Produto');
    await this.assertCategoryExists(input.categoryId);
    await this.assertCategoryAvailable(input.productId, input.categoryId);
    return this.repo.create(input, actor);
  }

  async update(
    id: string,
    expectedVersion: number,
    input: UpdateProductOfferInput,
    actor: CatalogActor,
  ): Promise<ProductOfferRecord> {
    if (input.priceCents !== undefined) this.assertValidPrice(input.priceCents);
    if (input.categoryId !== undefined) {
      await this.assertCategoryExists(input.categoryId);
      const current = await this.repo.findById(id);
      if (!current) throw new CatalogNotFoundError('Oferta');
      await this.assertCategoryAvailable(current.productId, input.categoryId, id);
    }
    return this.repo.update(id, expectedVersion, input, actor);
  }

  setAvailable(
    id: string,
    expectedVersion: number,
    available: boolean,
  ): Promise<ProductOfferRecord> {
    return this.repo.setAvailable(id, expectedVersion, available);
  }

  async remove(id: string, expectedVersion: number): Promise<void> {
    const offer = await this.repo.findById(id);
    if (!offer) throw new CatalogNotFoundError('Oferta');
    if (offer.isPrimary) {
      throw new CatalogValidationError(
        'A oferta principal não pode ser removida. Mova ou exclua o produto pelo cardápio.',
      );
    }
    await this.repo.softDelete(id, expectedVersion);
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

  private async assertCategoryAvailable(
    productId: string,
    categoryId: string,
    excludingId?: string,
  ): Promise<void> {
    if (await this.repo.offerExists(productId, categoryId, excludingId)) {
      throw new CatalogValidationError('Este produto já está disponível nesta categoria.');
    }
  }
}
