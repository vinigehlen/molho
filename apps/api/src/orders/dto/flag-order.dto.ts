import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Min, MaxLength } from 'class-validator';

export class FlagOrderDto {
  @IsBoolean()
  flagged!: boolean;

  /** Lock otimista — não sinaliza em cima de um pedido que mudou desde a tela. */
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  /** Só faz sentido com `flagged: true` — ignorado (não persistido) quando `flagged: false`. */
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
