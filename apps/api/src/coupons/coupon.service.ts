import { CatalogConflictError, CatalogValidationError } from '../catalog/catalog-errors';
import type { CouponRecord, CouponRepository, CreateCouponInput, UpdateCouponInput } from './coupon.repository';

export class CouponService {
  constructor(private readonly repo: CouponRepository) {}

  list(): Promise<CouponRecord[]> {
    return this.repo.list();
  }

  get(id: string): Promise<CouponRecord | null> {
    return this.repo.findById(id);
  }

  // async: mesmo achado de ModifierService — sem isso o throw síncrono de
  // assertValidCreate escaparia da chamada em vez de rejeitar a Promise.
  async create(input: CreateCouponInput): Promise<CouponRecord> {
    this.assertValidCreate(input);
    // Checar ANTES do INSERT dá 409 amigável (CatalogConflictError) — sem
    // isso, a colisão só apareceria como erro cru de constraint do Postgres.
    // Ainda existe uma corrida de milissegundos entre o check e o INSERT
    // (mesma classe do índice único parcial cobrindo o caso raro); aceitável
    // aqui — cupom não é um recurso de alto volume/concorrência como zona.
    if (await this.repo.codeTaken(input.code)) {
      throw new CatalogConflictError('Cupom');
    }
    return this.repo.create(input);
  }

  async update(id: string, expectedVersion: number, input: UpdateCouponInput): Promise<CouponRecord> {
    if (input.startsAt !== undefined && input.endsAt !== undefined && input.startsAt >= input.endsAt) {
      throw new CatalogValidationError('startsAt precisa ser antes de endsAt.');
    }
    if (input.minOrderCents !== undefined && input.minOrderCents < 0) {
      throw new CatalogValidationError('minOrderCents precisa ser >= 0.');
    }
    if (input.maxUses !== undefined && input.maxUses < 1) {
      throw new CatalogValidationError('maxUses precisa ser >= 1.');
    }
    return this.repo.update(id, expectedVersion, input);
  }

  delete(id: string, expectedVersion: number): Promise<void> {
    return this.repo.softDelete(id, expectedVersion);
  }

  private assertValidCreate(input: CreateCouponInput): void {
    if (input.code.trim().length === 0) {
      throw new CatalogValidationError('code não pode ser vazio.');
    }
    // XOR de verdade — mesma exigência do CHECK coupons_discount_value_xor_check
    // na migration. O zod já barra isso na borda HTTP (coupon-admin.ts); esta
    // é a segunda linha de defesa pra quem chamar o service direto.
    if (input.discountType === 'percent') {
      if (input.discountPercent === undefined || input.discountValueCents !== undefined) {
        throw new CatalogValidationError('discountType percent exige SÓ discountPercent.');
      }
    } else if (input.discountValueCents === undefined || input.discountPercent !== undefined) {
      throw new CatalogValidationError('discountType fixed exige SÓ discountValueCents.');
    }
    if (input.startsAt >= input.endsAt) {
      throw new CatalogValidationError('startsAt precisa ser antes de endsAt.');
    }
    if (input.maxUses < 1) {
      throw new CatalogValidationError('maxUses precisa ser >= 1.');
    }
  }
}
