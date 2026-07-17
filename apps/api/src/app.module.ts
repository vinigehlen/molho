import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { ContextModule } from './context/context.module';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './messaging/messaging.module';

@Module({
  imports: [ContextModule, MessagingModule, AuthModule],
  controllers: [HealthController],
})
export class AppModule {}
