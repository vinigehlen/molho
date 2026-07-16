import { Module } from '@nestjs/common';
import { OtpModule } from './auth/otp/otp.module';
import { TokenModule } from './auth/token/token.module';
import { ContextModule } from './context/context.module';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [ContextModule, MessagingModule, OtpModule, TokenModule],
  controllers: [HealthController],
})
export class AppModule {}
