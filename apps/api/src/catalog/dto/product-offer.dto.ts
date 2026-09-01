import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

const COMBO_PRICING_MODES = ['fixed', 'sum_of_items'] as const;

export class CreateProductOfferDto {
  @IsUUID(7)
  productId!: string;

  @IsUUID(7)
  categoryId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents!: number;

  @IsOptional()
  @IsBoolean()
  available?: boolean;

  @IsOptional()
  @IsIn(COMBO_PRICING_MODES)
  comboPricingMode?: 'fixed' | 'sum_of_items';

  @IsOptional()
  @IsString()
  pdvCode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateProductOfferDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsUUID(7)
  categoryId?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceCents?: number;

  @IsOptional()
  @IsIn(COMBO_PRICING_MODES)
  comboPricingMode?: 'fixed' | 'sum_of_items';

  @IsOptional()
  @IsString()
  pdvCode?: string | null;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

/** Disponibilidade continua numa permissão separada: cashier pode pausar sem
 * ganhar acesso à edição de preço. */
export class SetProductOfferAvailabilityDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsBoolean()
  available!: boolean;
}
