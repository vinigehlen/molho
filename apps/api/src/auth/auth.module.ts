import { Module } from '@nestjs/common';
import { ContextModule } from '../context/context.module';
import { MessagingModule } from '../messaging/messaging.module';
import { ModuleCheckModule } from '../modules/module-check.module';
import { CustomerJwtAuthGuard } from './guards/customer-jwt-auth.guard';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RequireModuleGuard } from './guards/require-module.guard';
import { RequirePermissionGuard } from './guards/require-permission.guard';
import { TenantContextInterceptor } from './guards/tenant-context.interceptor';
import { OtpModule } from './otp/otp.module';
import { TokenModule } from './token/token.module';
import { CustomerAuthController } from './customer-auth.controller';
import { SessionsController } from './sessions.controller';
import { StaffAuthController } from './staff-auth.controller';

@Module({
  imports: [ContextModule, MessagingModule, ModuleCheckModule, OtpModule, TokenModule],
  controllers: [StaffAuthController, CustomerAuthController, SessionsController],
  providers: [JwtAuthGuard, CustomerJwtAuthGuard, TenantContextInterceptor, RequireModuleGuard, RequirePermissionGuard],
  exports: [JwtAuthGuard, CustomerJwtAuthGuard, TenantContextInterceptor, RequireModuleGuard, RequirePermissionGuard],
})
export class AuthModule {}
