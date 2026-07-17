import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { TenantContextInterceptor } from './guards/tenant-context.interceptor';
import { OtpModule } from './otp/otp.module';
import { TokenModule } from './token/token.module';
import { CustomerAuthController } from './customer-auth.controller';
import { SessionsController } from './sessions.controller';
import { StaffAuthController } from './staff-auth.controller';

@Module({
  imports: [ContextModule, OtpModule, TokenModule],
  controllers: [StaffAuthController, CustomerAuthController, SessionsController],
  providers: [JwtAuthGuard, TenantContextInterceptor],
  exports: [JwtAuthGuard, TenantContextInterceptor],
})
export class AuthModule {}
