import { Body, ConflictException, Controller, ForbiddenException, Inject, NotFoundException, Param, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { COPY, createReviewSchema, orderTrackingTokenSchema, type CreateReviewInput } from '@molho/contracts';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { OrderNotEligibleForReviewError, ReviewAlreadyExistsError } from './review.errors';
import { REVIEW_SERVICE } from './review.tokens';
import type { ReviewService } from './review.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Convite de avaliação pra pedido GUEST (Épico 16.3, [16-D1]) — irmã de
 * `ReviewsController`, mas sem `CustomerJwtAuthGuard`: pedido guest não tem
 * sessão (CLAUDE.md regra 13), então a autorização é o MESMO token opaco
 * não-adivinhável do acompanhamento (`OrderTrackingController`), não um JWT.
 * Vive num controller PRÓPRIO em vez de um método a mais em
 * `ReviewsController` porque `@UseGuards` de classe não tem como ser
 * "desligado" por método — a única forma limpa de ter uma rota sem o guard
 * de JWT é um controller que nunca o declara.
 */
@Controller('v1/store/:slug/track/:token')
@UseGuards(RequireModuleGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('reviews')
export class TrackReviewController {
  constructor(@Inject(REVIEW_SERVICE) private readonly reviews: ReviewService) {}

  @Post('review')
  async create(@Param('token') token: string, @Body(new ZodValidationPipe(createReviewSchema)) body: CreateReviewInput) {
    const parsed = orderTrackingTokenSchema.safeParse(token);
    if (!parsed.success) throw new NotFoundException(COPY.erros.naoEncontrado);

    try {
      return await this.reviews.createForOrderByToken(parsed.data, body);
    } catch (error) {
      if (error instanceof OrderNotEligibleForReviewError) throw new ForbiddenException(error.message);
      if (error instanceof ReviewAlreadyExistsError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
