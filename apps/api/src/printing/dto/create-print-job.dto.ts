import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePrintJobDto {
  /** Prefixo — a API cria `<prefix>:counter` e `<prefix>:kitchen`. */
  @IsString()
  @MaxLength(150)
  idempotencyPrefix!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  width!: number;

  @IsBoolean()
  cut!: boolean;
}

