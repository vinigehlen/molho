import { Type } from 'class-transformer';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateModifierDto {
  @IsUUID(7)
  groupId!: string;

  @IsString()
  @IsNotEmpty()
  name!: string;

  /** Sempre >= 0 — complemento nunca reduz o preço base. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priceDeltaCents!: number;
}

export class UpdateModifierDto {
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
  priceDeltaCents?: number;
}
