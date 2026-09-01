import type { CatalogActor } from './catalog-actor';
import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type { ComboPricingMode, ProductKind } from '@molho/contracts';
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
    const productKind = await this.repo.findProductKind(input.productId);
    if (!productKind) throw new CatalogNotFoundError('Produto');
    this.assertComboPricingFitsProduct(input.comboPricingMode, productKind);
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
    let current: ProductOfferRecord | undefined;
    if (input.categoryId !== undefined || input.comboPricingMode !== undefined) {
      current = (await this.repo.findById(id)) ?? undefined;
      if (current === undefined) throw new CatalogNotFoundError('Oferta');
    }
    if (input.categoryId !== undefined) {
      if (current === undefined) throw new CatalogNotFoundError('Oferta');
      await this.assertCategoryExists(input.categoryId);
      await this.assertCategoryAvailable(current.productId, input.categoryId, id);
    }
    if (input.comboPricingMode !== undefined) {
      if (current === undefined) throw new CatalogNotFoundError('Oferta');
      const productKind = await this.repo.findProductKind(current.productId);
      if (!productKind) throw new CatalogNotFoundError('Produto');
      this.assertComboPricingFitsProduct(input.comboPricingMode, productKind);
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

  private assertComboPricingFitsProduct(
    mode: ComboPricingMode | undefined,
    productKind: ProductKind,
  ): void {
    if (mode === 'sum_of_items' && productKind !== 'combo') {
      throw new CatalogValidationError(
        'Preço pela soma dos itens só pode ser usado em produto do tipo combo.',
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
