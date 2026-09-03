import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { PromotionsController } from './promotions.controller';
import { PromotionService } from './promotion.service';
import { PrismaPromotionRepository } from './promotion.repository';
import { PROMOTION_SERVICE } from './promotion.tokens';

export { PROMOTION_SERVICE };

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [PromotionsController],
  providers: [
    {
      provide: PROMOTION_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): PromotionService =>
        new PromotionService(new PrismaPromotionRepository(requestContext)),
    },
  ],
  exports: [PROMOTION_SERVICE],
})
export class PromotionsModule {}
