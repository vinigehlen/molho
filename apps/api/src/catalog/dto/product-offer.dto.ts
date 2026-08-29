import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, IsUUID, Min } from 'class-validator';

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
