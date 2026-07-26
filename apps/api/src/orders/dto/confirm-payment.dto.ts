import { Type } from 'class-transformer';
import { IsInt, Min } from 'class-validator';

/** Lock otimista (mesmo padrão de VersionQueryDto/UpdateCategoryDto) — evita confirmar em cima de um pedido que mudou desde que o lojista abriu a tela. */
export class ConfirmPaymentDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  version!: number;
}
