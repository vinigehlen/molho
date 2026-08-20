import {
  BadRequestException,
  Body,
  ConflictException,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  createDeliveryZoneSchema,
  type CreateDeliveryZoneInput,
  updateDeliveryZoneSchema,
  type UpdateDeliveryZoneInput,
} from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import {
  DeliveryZoneConflictError,
  DeliveryZoneDuplicateCityError,
  DeliveryZoneNotFoundError,
  DeliveryZonePreconditionRequiredError,
  DeliveryZoneValidationError,
} from './delivery-zone.errors';
import { DELIVERY_ZONE_ADMIN_SERVICE } from './delivery-zone.tokens';
import type { DeliveryZoneAdminService } from './delivery-zone.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/** `If-Match` carrega a `version` esperada — ausente ou não-inteiro-não-negativo é 428. */
function parseIfMatch(value: string | undefined): number {
  if (value === undefined || !/^\d+$/.test(value.trim())) throw new DeliveryZonePreconditionRequiredError();
  return Number(value.trim());
}

@Controller()
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('delivery.zones')
export class DeliveryZoneAdminController {
  constructor(@Inject(DELIVERY_ZONE_ADMIN_SERVICE) private readonly zones: DeliveryZoneAdminService) {}

  @Get('v1/admin/stores/:storeId/delivery-zones')
  list(@Param('storeId') storeId: string) {
    return this.handle(() => this.zones.list(storeId));
  }

  @Post('v1/admin/stores/:storeId/delivery-zones')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @Param('storeId') storeId: string,
    @Body(new ZodValidationPipe(createDeliveryZoneSchema)) dto: CreateDeliveryZoneInput,
  ) {
    return this.handle(() => this.zones.create(storeId, dto));
  }

  @Patch('v1/admin/delivery-zones/:zoneId')
  @RequirePermission('catalog.product.update')
  async update(
    @Param('zoneId') zoneId: string,
    @Headers('if-match') ifMatch: string | undefined,
    @Body(new ZodValidationPipe(updateDeliveryZoneSchema)) dto: UpdateDeliveryZoneInput,
  ) {
    return this.handle(() => this.zones.update(zoneId, parseIfMatch(ifMatch), dto));
  }

  @Delete('v1/admin/delivery-zones/:zoneId')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('zoneId') zoneId: string, @Headers('if-match') ifMatch: string | undefined): Promise<void> {
    await this.handle(() => this.zones.delete(zoneId, parseIfMatch(ifMatch)));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof DeliveryZoneNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof DeliveryZoneDuplicateCityError || error instanceof DeliveryZoneConflictError) {
        throw new ConflictException(error.message);
      }
      if (error instanceof DeliveryZoneValidationError) throw new BadRequestException(error.message);
      if (error instanceof DeliveryZonePreconditionRequiredError) {
        throw new HttpException(error.message, 428);
      }
      throw error;
    }
  }
}
