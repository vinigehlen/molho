import { Body, ConflictException, Controller, ForbiddenException, Inject, Param, Post, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { createReviewSchema, type CreateReviewInput } from '@molho/contracts';
import { CustomerJwtAuthGuard, type RequestWithCustomer } from '../auth/guards/customer-jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { OrderNotEligibleForReviewError, ReviewAlreadyExistsError } from './review.errors';
import { REVIEW_SERVICE } from './review.tokens';
import type { ReviewService } from './review.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Cliente avalia o PRÓPRIO pedido (Épico 16, D1) — imutável: só cria, nunca
 * edita/apaga. `@RequireModule('reviews')` + `CustomerJwtAuthGuard` (não
 * staff): quem avalia é sempre quem fez o pedido.
 */
@Controller('v1/store/:slug/orders/:orderId/review')
@UseGuards(CustomerJwtAuthGuard, RequireModuleGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('reviews')
export class ReviewsController {
  constructor(@Inject(REVIEW_SERVICE) private readonly reviews: ReviewService) {}

  @Post()
  async create(
    @Req() request: RequestWithCustomer,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewInput,
  ) {
    try {
      return await this.reviews.createForOrder(request.user.sub, orderId, body);
    } catch (error) {
      if (error instanceof OrderNotEligibleForReviewError) throw new ForbiddenException(error.message);
      if (error instanceof ReviewAlreadyExistsError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
