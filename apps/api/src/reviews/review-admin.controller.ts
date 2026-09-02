import { Body, ConflictException, Controller, Get, Inject, NotFoundException, Param, Patch, UseGuards, UseInterceptors } from '@nestjs/common';
import { replyReviewSchema, type ReplyReviewInput } from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { ReviewConflictError, ReviewNotFoundError } from './review.errors';
import { REVIEW_SERVICE } from './review.tokens';
import type { ReviewService } from './review.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Admin de avaliações (Épico 16, D2) — lojista responde publicamente, uma
 * resposta por review. `growth.manage` reusado (mesmo racional de cupons:
 * avaliação é alavanca de crescimento, não ganha permissão própria na matriz).
 */
@Controller('v1/admin/reviews')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('reviews')
export class ReviewAdminController {
  constructor(@Inject(REVIEW_SERVICE) private readonly reviews: ReviewService) {}

  @Get()
  list() {
    return this.reviews.list();
  }

  @Patch(':id/reply')
  @RequirePermission('growth.manage')
  async reply(@Param('id') id: string, @Body(new ZodValidationPipe(replyReviewSchema)) body: ReplyReviewInput) {
    try {
      return await this.reviews.reply(id, body.version, body.reply);
    } catch (error) {
      if (error instanceof ReviewNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof ReviewConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
