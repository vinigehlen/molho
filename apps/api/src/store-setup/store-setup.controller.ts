import { BadRequestException, Body, Controller, Get, Inject, NotFoundException, Param, Put, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { type UpdateStoreSetupInput, updateStoreSetupSchema } from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { STORE_SETUP_SERVICE } from './store-setup.tokens';
import { StoreSetupNotFoundError, StoreSetupValidationError } from './store-setup.errors';
import type { StoreSetupService } from './store-setup.service';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';

@Controller('v1/admin/stores/:storeId/setup')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('catalog')
export class StoreSetupController {
  constructor(@Inject(STORE_SETUP_SERVICE) private readonly setup: StoreSetupService) {}

  @Get()
  get(@Param('storeId') storeId: string, @Req() req: RequestWithUser) {
    return this.handle(() => this.setup.get(storeId, req.user.sub));
  }

  @Put()
  @RequirePermission('catalog.product.update')
  update(
    @Param('storeId') storeId: string,
    @Req() req: RequestWithUser,
    @Body(new ZodValidationPipe(updateStoreSetupSchema)) dto: UpdateStoreSetupInput,
  ) {
    return this.handle(() => this.setup.update(storeId, dto, req.user.sub));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StoreSetupNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof StoreSetupValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
