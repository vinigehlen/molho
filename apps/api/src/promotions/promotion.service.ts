import { CatalogNotFoundError, CatalogValidationError } from '../catalog/catalog-errors';
import type {
  CreatePromotionInput,
  PromotionRecord,
  PromotionRepository,
  UpdatePromotionInput,
} from './promotion.repository';

export class PromotionService {
  constructor(private readonly repo: PromotionRepository) {}

  list(): Promise<PromotionRecord[]> {
    return this.repo.list();
  }

  get(id: string): Promise<PromotionRecord | null> {
    return this.repo.findById(id);
  }

  // async: mesmo achado de CouponService — sem isso o throw síncrono de
  // assertValidCreate escaparia da chamada em vez de rejeitar a Promise.
  async create(input: CreatePromotionInput): Promise<PromotionRecord> {
    this.assertValidWindow(input.startTime, input.endTime, input.weekdays);
    if (input.scope !== 'store_wide') {
      if (!input.scopeId) throw new CatalogValidationError('scope category/product exige scopeId.');
      // Existência checada aqui (não só o zod validar formato de UUID) —
      // criar uma promoção apontando pro produto/categoria errado (ou de
      // outro tenant) nunca deveria passar batido até a hora de aplicar no
      // checkout, quando o erro ficaria bem mais difícil de rastrear.
      if (!(await this.repo.targetExists(input.scope, input.scopeId))) {
        throw new CatalogNotFoundError(input.scope === 'category' ? 'Categoria' : 'Produto');
      }
    }
    return this.repo.create(input);
  }

  async update(id: string, expectedVersion: number, input: UpdatePromotionInput): Promise<PromotionRecord> {
    if (input.startTime !== undefined || input.endTime !== undefined || input.weekdays !== undefined) {
      const current = await this.repo.findById(id);
      if (!current) throw new CatalogNotFoundError('Promoção');
      this.assertValidWindow(
        input.startTime ?? current.startTime,
        input.endTime ?? current.endTime,
        input.weekdays ?? current.weekdays,
      );
    }
    return this.repo.update(id, expectedVersion, input);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  private assertValidWindow(startTime: string, endTime: string, weekdays: number[]): void {
    if (weekdays.length === 0) {
      throw new CatalogValidationError('weekdays precisa ter ao menos um dia.');
    }
    if (startTime === endTime) {
      throw new CatalogValidationError('startTime e endTime não podem ser iguais (janela vazia).');
    }
  }
}
