import { Type } from 'class-transformer';
import { IsIn, IsInt, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';
import { ALLOWED_IMAGE_CONTENT_TYPES } from '../../storage/storage-provider.port';

/** Lido uma vez, no load do módulo — dotenv já rodou antes do Nest bootstrap (mesmo padrão de MOLHO_JWT_SECRETS). */
const MAX_IMAGE_BYTES = Number(process.env.MOLHO_MAX_IMAGE_BYTES ?? 5_242_880);

export class CreateImageUploadUrlDto {
  @IsIn(Object.keys(ALLOWED_IMAGE_CONTENT_TYPES))
  contentType!: keyof typeof ALLOWED_IMAGE_CONTENT_TYPES;

  /**
   * Validado ANTES de pedir a URL assinada — acima do teto nem chega a
   * gerar URL (400 imediato, UI mostra erro amigável em vez de esperar o
   * 403 do R2). O mesmo valor é assinado como Content-Length exato no PUT.
   */
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_IMAGE_BYTES)
  contentLength!: number;
}

/** Confirma uma foto na galeria depois do PUT direto no R2 (mesmo fluxo de CreateImageUploadUrlDto). */
export class AddProductImageDto {
  @IsString()
  @IsNotEmpty()
  imageKey!: string;

  /** Omitido = entra no fim da galeria (ProductImageService.add). */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}

export class UpdateProductImageDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  position?: number;
}
