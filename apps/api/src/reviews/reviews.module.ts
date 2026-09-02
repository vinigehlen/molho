import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { TokenModule } from '../auth/token/token.module';
import { ContextModule } from '../context/context.module';
import { RequestContextService } from '../context/request-context.service';
import { ModuleCheckModule } from '../modules/module-check.module';
import { ReviewAdminController } from './review-admin.controller';
import { PrismaReviewRepository } from './review.repository';
import { ReviewService } from './review.service';
import { REVIEW_SERVICE } from './review.tokens';
import { ReviewsController } from './reviews.controller';

export { REVIEW_SERVICE };

@Module({
  imports: [AuthModule, ContextModule, ModuleCheckModule, TokenModule],
  controllers: [ReviewsController, ReviewAdminController],
  providers: [
    {
      provide: REVIEW_SERVICE,
      inject: [RequestContextService],
      useFactory: (requestContext: RequestContextService): ReviewService => new ReviewService(new PrismaReviewRepository(requestContext)),
    },
  ],
})
export class ReviewsModule {}
