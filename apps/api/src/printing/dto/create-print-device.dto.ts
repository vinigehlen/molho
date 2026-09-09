import { IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CreatePrintDeviceDto {
  /** Rótulo do dispositivo ("Cozinha", "Balcão"). Único por loja. */
  @IsString()
  @MinLength(1)
  @MaxLength(60)
  @Matches(/^[\p{L}\p{N} _.-]+$/u, { message: 'name: só letras, números, espaço e . _ -' })
  name!: string;
}
