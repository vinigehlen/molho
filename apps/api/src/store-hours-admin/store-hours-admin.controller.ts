import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Put,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { type PutStoreHoursInput, putStoreHoursSchema } from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { STORE_HOURS_ADMIN_SERVICE } from './store-hours-admin.tokens';
import { StoreHoursStoreNotFoundError, StoreHoursValidationError } from './store-hours-admin.errors';
import type { StoreHoursAdminService } from './store-hours-admin.service';
import { ZodValidationPipe } from './zod-validation.pipe';

@Controller('v1/admin/stores/:storeId/hours')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('catalog')
export class StoreHoursAdminController {
  constructor(@Inject(STORE_HOURS_ADMIN_SERVICE) private readonly hours: StoreHoursAdminService) {}

  @Get()
  list(@Param('storeId') storeId: string) {
    return this.handle(() => this.hours.list(storeId));
  }

  @Put()
  @RequirePermission('catalog.product.update')
  replaceAll(
    @Param('storeId') storeId: string,
    @Body(new ZodValidationPipe(putStoreHoursSchema)) dto: PutStoreHoursInput,
  ) {
    return this.handle(() => this.hours.replaceAll(storeId, dto));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof StoreHoursStoreNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof StoreHoursValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
