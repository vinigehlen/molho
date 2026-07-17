import { IsNotEmpty, IsString } from 'class-validator';

/**
 * Validação de FORMA (é string, não é vazio) — o formato de telefone
 * brasileiro de verdade é responsabilidade de PhoneNumber.parse() (domínio),
 * não duplicado aqui.
 */
export class OtpRequestDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;
}
