import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/**
 * Validação de FORMA (é string, não é vazio) — o formato de telefone
 * brasileiro de verdade é responsabilidade de PhoneNumber.parse() (domínio),
 * e o de e-mail do parseEmail(); não duplicado aqui.
 *
 * Os dois campos são opcionais NO DTO porque a obrigatoriedade depende do
 * CANAL (Épico 9c) e do escopo: staff por e-mail exige `email`; cliente exige
 * `phone` sempre (é a identidade) e mais `email` quando o canal é e-mail. A
 * checagem de presença fica no controller, que é quem conhece o canal —
 * validação condicional no class-validator fica ilegível pela mesma garantia.
 */
export class OtpRequestDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  email?: string;
}
