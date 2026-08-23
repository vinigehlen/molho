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
import { type PutSchedulingSlotsInput, putSchedulingSlotsSchema } from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { SCHEDULING_SLOT_ADMIN_SERVICE } from './scheduling-slot-admin.tokens';
import { SchedulingSlotStoreNotFoundError, SchedulingSlotValidationError } from './scheduling-slot-admin.errors';
import type { SchedulingSlotAdminService } from './scheduling-slot-admin.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Mesmo desenho de StoreHoursAdminController (PUT do conjunto inteiro,
 * @RequireModule('catalog') + catalog.product.update — agendamento é
 * configuração de operação da loja, mesma categoria de horário de
 * funcionamento, sem módulo/permissão própria na matriz ainda).
 */
@Controller('v1/admin/stores/:storeId/scheduling-slots')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('catalog')
export class SchedulingSlotAdminController {
  constructor(@Inject(SCHEDULING_SLOT_ADMIN_SERVICE) private readonly slots: SchedulingSlotAdminService) {}

  @Get()
  list(@Param('storeId') storeId: string) {
    return this.handle(() => this.slots.list(storeId));
  }

  @Put()
  @RequirePermission('catalog.product.update')
  replaceAll(
    @Param('storeId') storeId: string,
    @Body(new ZodValidationPipe(putSchedulingSlotsSchema)) dto: PutSchedulingSlotsInput,
  ) {
    return this.handle(() => this.slots.replaceAll(storeId, dto));
  }

  private async handle<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SchedulingSlotStoreNotFoundError) throw new NotFoundException(error.message);
      if (error instanceof SchedulingSlotValidationError) throw new BadRequestException(error.message);
      throw error;
    }
  }
}
