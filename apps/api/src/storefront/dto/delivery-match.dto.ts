import { IsOptional, IsString, Matches } from 'class-validator';

/** Mesmo intervalo de `deliveryMatchRequestSchema` em @molho/contracts. */
export class DeliveryMatchRequestDto {
  @Matches(/^\d{5}-?\d{3}$/, { message: 'CEP precisa ter 8 dígitos' })
  postalCode!: string;

  /** Opcional: a taxa vem da CIDADE, o número só refina o ponto. */
  @IsOptional()
  @IsString()
  number!: string | null;
}
