import { IsNotEmpty, IsString, Matches } from 'class-validator';

export class OtpVerifyDto {
  @IsString()
  @IsNotEmpty()
  phone!: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'code precisa ter exatamente 6 dígitos' })
  code!: string;
}
