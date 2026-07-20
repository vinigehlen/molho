import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module';
import { CatalogModule } from './catalog/catalog.module';
import { ContextModule } from './context/context.module';
import { HealthController } from './health/health.controller';
import { MessagingModule } from './messaging/messaging.module';
import { StorefrontModule } from './storefront/storefront.module';

@Module({
  imports: [ContextModule, MessagingModule, AuthModule, CatalogModule, StorefrontModule],
  controllers: [HealthController],
})
export class AppModule {}
