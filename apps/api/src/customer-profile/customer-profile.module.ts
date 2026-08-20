import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { CustomerProfileController } from './customer-profile.controller';
import { CustomerProfileService } from './customer-profile.service';
import { CUSTOMER_PROFILE_SERVICE } from './customer-profile.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [CustomerProfileController],
  providers: [
    {
      provide: CUSTOMER_PROFILE_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new CustomerProfileService(requestContext),
    },
  ],
})
export class CustomerProfileModule {}

