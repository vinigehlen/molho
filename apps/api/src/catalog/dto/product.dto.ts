import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateProductDto {
  @IsUUID(7)
  categoryId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  /** Sempre inteiro em centavos, nunca float (CLAUDE.md regra 4). */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePriceCents!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

export class UpdateProductDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsUUID(7)
  categoryId?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  name?: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  basePriceCents?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  sortOrder?: number;
}

/** "Esgotado manual" (definicoes-v1 §5.4) — endpoint dedicado, nunca via UpdateProductDto (ver ProductService.setAvailable). */
export class SetProductAvailabilityDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsBoolean()
  available!: boolean;
}
