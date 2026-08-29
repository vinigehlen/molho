import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateModifierGroupDto {
  @IsUUID(7)
  productId!: string;

  @IsString()
  @IsNotEmpty()
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
  pdvCode?: string | null;
}

/** Reuso (exceção MVP 2026-08-28, fase 2/4) — vincula um grupo EXISTENTE a outro produto. */
export class LinkModifierGroupDto {
  @IsUUID(7)
  productId!: string;
}
