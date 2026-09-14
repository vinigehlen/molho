import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { PrismaCashSessionRepository } from './cash-session.repository';
import { CashSessionController } from './cash-session.controller';
import { CashAnalyticsController } from './cash-analytics.controller';
import { CashSessionService } from './cash-session.service';
import { PrismaStaffPinRepository } from './staff-pin.repository';
import { StaffPinController } from './staff-pin.controller';
import { StaffPinService } from './staff-pin.service';
import {
  CASH_SESSION_REPOSITORY,
  CASH_SESSION_SERVICE,
  STAFF_PIN_REPOSITORY,
  STAFF_PIN_SERVICE,
} from './cash.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [CashSessionController, StaffPinController, CashAnalyticsController],
  providers: [
    {
      provide: CASH_SESSION_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (ctx: RequestContextService) => new PrismaCashSessionRepository(ctx),
    },
    {
      provide: STAFF_PIN_REPOSITORY,
      inject: [RequestContextService],
      useFactory: (ctx: RequestContextService) => new PrismaStaffPinRepository(ctx),
    },
    {
      provide: STAFF_PIN_SERVICE,
      inject: [STAFF_PIN_REPOSITORY],
      useFactory: (repo: PrismaStaffPinRepository) => new StaffPinService(repo),
    },
    {
      provide: CASH_SESSION_SERVICE,
      inject: [CASH_SESSION_REPOSITORY, STAFF_PIN_SERVICE, STAFF_PIN_REPOSITORY],
      useFactory: (repo: PrismaCashSessionRepository, pins: StaffPinService, pinRepo: PrismaStaffPinRepository) =>
        new CashSessionService(repo, pins, pinRepo),
    },
  ],
  exports: [CASH_SESSION_SERVICE],
})
export class CashModule {}
