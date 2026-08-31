import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreateModifierGroupDto {
  @IsUUID(7)
  productId!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  max?: number;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pdvCode?: string | null;
}

export class UpdateModifierGroupDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  name?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  min?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  max?: number;

  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(60)
  pdvCode?: string | null;
}

/** Reuso (exceção MVP 2026-08-28, fase 2/4) — vincula um grupo EXISTENTE a outro produto. */
export class LinkModifierGroupDto {
  @IsUUID(7)
  productId!: string;
}

/** Separa um dos produtos de um grupo reutilizado. A cópia leva as opções
 * junto e substitui apenas o vínculo deste produto. */
export class CopyModifierGroupForProductDto {
  @IsUUID(7)
  productId!: string;
}
