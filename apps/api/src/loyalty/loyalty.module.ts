import { Module } from '@nestjs/common';
import type { ModuleCache } from '@molho/db';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { MODULE_CACHE, ModuleCheckModule } from '../modules/module-check.module';
import { PrismaLoyaltyGate } from '../modules/loyalty.gate';
import type { LoyaltyCreditor } from '../orders/loyalty-creditor.port';
import { LoyaltyBalanceController } from './loyalty-balance.controller';
import { PrismaLoyaltyBalanceRepository } from './loyalty-balance.repository';
import { LoyaltyConfigController } from './loyalty-config.controller';
import { PrismaLoyaltyConfigRepository } from './loyalty-config.repository';
import { LoyaltyConfigService } from './loyalty-config.service';
import { RealLoyaltyCreditor } from './loyalty-creditor';
import { LOYALTY_BALANCE_REPOSITORY, LOYALTY_CONFIG_SERVICE, LOYALTY_CREDITOR } from './loyalty.tokens';

export { LOYALTY_CREDITOR };

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [LoyaltyConfigController, LoyaltyBalanceController],
  providers: [
    {
      provide: LOYALTY_CONFIG_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): LoyaltyConfigService =>
        new LoyaltyConfigService(new PrismaLoyaltyConfigRepository(requestContext)),
    },
    {
      provide: LOYALTY_BALANCE_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new PrismaLoyaltyBalanceRepository(requestContext),
    },
    {
      provide: LOYALTY_CREDITOR,
      inject: [RequestContextService, MODULE_CACHE],
      useFactory: (requestContext: RequestContextService, moduleCache: ModuleCache): LoyaltyCreditor =>
        new RealLoyaltyCreditor(
          new PrismaLoyaltyGate(requestContext, moduleCache),
          new PrismaLoyaltyConfigRepository(requestContext),
          new PrismaLoyaltyBalanceRepository(requestContext),
        ),
    },
  ],
  exports: [LOYALTY_CREDITOR],
})
export class LoyaltyModule {}
