import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { PlatformSubscriptionController } from './platform-subscription.controller';
import { PrismaSubscriptionRepository } from './subscription.repository';
import { SubscriptionService } from './subscription.service';
import { SUBSCRIPTION_SERVICE } from './subscription.tokens';
import { SubscriptionController } from './subscription.controller';

export { SUBSCRIPTION_SERVICE };

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [SubscriptionController, PlatformSubscriptionController],
  providers: [
    {
      provide: SUBSCRIPTION_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): SubscriptionService =>
        new SubscriptionService(new PrismaSubscriptionRepository(requestContext)),
    },
  ],
})
export class BillingModule {}
