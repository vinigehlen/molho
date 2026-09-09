import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { AnalyticsController } from './analytics.controller';
import { AnalyticsService } from './analytics.service';
import { CmvController } from './cmv.controller';
import { CmvService } from './cmv.service';
import { ANALYTICS_SERVICE, CMV_SERVICE } from './analytics.tokens';

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [AnalyticsController, CmvController],
  providers: [
    {
      provide: ANALYTICS_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new AnalyticsService(requestContext),
    },
    {
      provide: CMV_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService) => new CmvService(requestContext),
    },
  ],
})
export class AnalyticsModule {}
