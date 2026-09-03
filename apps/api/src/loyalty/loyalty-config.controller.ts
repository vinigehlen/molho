import { Body, ConflictException, Controller, Get, Inject, Put, UseGuards, UseInterceptors } from '@nestjs/common';
import { updateLoyaltyConfigSchema, type UpdateLoyaltyConfigInput } from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { LoyaltyConfigConflictError } from './loyalty.errors';
import { LOYALTY_CONFIG_SERVICE } from './loyalty.tokens';
import type { LoyaltyConfigService } from './loyalty-config.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/** Config de cashback (Épico 16b, D5) — `growth.manage` reusado, mesmo racional de cupons/avaliações. */
@Controller('v1/admin/loyalty/config')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('loyalty')
export class LoyaltyConfigController {
  constructor(@Inject(LOYALTY_CONFIG_SERVICE) private readonly config: LoyaltyConfigService) {}

  @Get()
  get() {
    return this.config.get();
  }

  @Put()
  @RequirePermission('growth.manage')
  async update(@Body(new ZodValidationPipe(updateLoyaltyConfigSchema)) body: UpdateLoyaltyConfigInput) {
    try {
      return await this.config.update(body.cashbackPercent, body.version);
    } catch (error) {
      if (error instanceof LoyaltyConfigConflictError) throw new ConflictException(error.message);
      throw error;
    }
  }
}
