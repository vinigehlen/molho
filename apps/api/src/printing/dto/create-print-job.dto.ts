import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreatePrintJobDto {
  @IsString()
  @MaxLength(160)
  idempotencyKey!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  width!: number;

  @IsBoolean()
  cut!: boolean;
}

