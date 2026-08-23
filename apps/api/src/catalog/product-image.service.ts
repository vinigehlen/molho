import { CatalogNotFoundError, CatalogValidationError } from './catalog-errors';
import type {
  CreateProductImageInput,
  ProductImageRecord,
  ProductImageRepository,
  UpdateProductImageInput,
} from './product-image.repository';

export class ProductImageService {
  constructor(private readonly repo: ProductImageRepository) {}

  listByProduct(productId: string): Promise<ProductImageRecord[]> {
    return this.repo.listByProduct(productId);
  }

  get(id: string): Promise<ProductImageRecord | null> {
    return this.repo.findById(id);
  }

  /**
   * `position` omitido entra no FIM da galeria (maxPosition + 1) — quem só
   * quer "adicionar mais uma foto" não precisa saber a ordem atual. Explícito
   * quando o admin quer inserir no meio (reordenar depois com update()).
   */
  async add(input: { productId: string; imageKey: string; position?: number }): Promise<ProductImageRecord> {
    this.assertValidImageKey(input.imageKey);
    if (!(await this.repo.productExists(input.productId))) {
      throw new CatalogNotFoundError('Produto');
    }
    const position = input.position ?? (await this.repo.maxPosition(input.productId)) + 1;
    this.assertValidPosition(position);
    const create: CreateProductImageInput = { productId: input.productId, imageKey: input.imageKey, position };
    return this.repo.create(create);
  }

  // async: mesmo achado de ModifierService — sem isso o throw síncrono de
  // assertValidPosition escaparia da chamada em vez de rejeitar a Promise.
  async reorder(id: string, expectedVersion: number, input: UpdateProductImageInput): Promise<ProductImageRecord> {
    if (input.position !== undefined) this.assertValidPosition(input.position);
    return this.repo.update(id, expectedVersion, input);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  private assertValidImageKey(imageKey: string): void {
    if (imageKey.trim().length === 0) {
      throw new CatalogValidationError('image_key não pode ser vazio.');
    }
  }

  private assertValidPosition(position: number): void {
    if (!Number.isInteger(position) || position < 0) {
      throw new CatalogValidationError('position precisa ser um inteiro >= 0.');
    }
  }
}
