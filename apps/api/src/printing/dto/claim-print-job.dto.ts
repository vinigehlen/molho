import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class ClaimPrintJobDto {
  @IsString()
  @MaxLength(160)
  workerId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(5)
  @Max(300)
  leaseSeconds!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(120)
  width?: number;
}

