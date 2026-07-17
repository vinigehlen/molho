import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { OtpModule } from './otp/otp.module';
import { TokenModule } from './token/token.module';
import { CustomerAuthController } from './customer-auth.controller';
import { StaffAuthController } from './staff-auth.controller';

@Module({
  imports: [ContextModule, OtpModule, TokenModule],
  controllers: [StaffAuthController, CustomerAuthController],
})
export class AuthModule {}
