import { IsNotEmpty, IsOptional, IsString, Matches, MaxLength } from 'class-validator';

/** Ver nota de obrigatoriedade-por-canal em otp-request.dto.ts. */
export class OtpVerifyDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  phone?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  email?: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code precisa ter exatamente 6 dígitos' })
  code!: string;

  /**
   * Opcional (cliente que já tem nome de verdade não sobrescreve, ver
   * `CustomerIdentityRepository.findOrCreate`) — sem isso o customer nasce
   * com o placeholder "Cliente" e a comanda nunca mostra nome nenhum.
   */
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;
}
