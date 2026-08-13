import { Type } from 'class-transformer';
import { IsInt, IsString, MaxLength, Min } from 'class-validator';

export class FinishPrintJobDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsString()
  @MaxLength(160)
  workerId!: string;
}

export class FailPrintJobDto extends FinishPrintJobDto {
  @IsString()
  @MaxLength(1000)
  error!: string;
}

