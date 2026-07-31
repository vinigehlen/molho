import { IsNotEmpty, IsOptional, IsString, Matches } from 'class-validator';

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
}
