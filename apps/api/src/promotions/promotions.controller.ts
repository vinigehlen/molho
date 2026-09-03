import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import {
  createPromotionSchema,
  type CreatePromotionInput,
  updatePromotionSchema,
  type UpdatePromotionInput,
} from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { CatalogExceptionFilter } from '../catalog/catalog-exception.filter';
import { VersionQueryDto } from '../catalog/dto/category.dto';
import { PROMOTION_SERVICE } from './promotion.tokens';
import type {
  CreatePromotionInput as RepoCreateInput,
  UpdatePromotionInput as RepoUpdateInput,
} from './promotion.repository';
import type { PromotionService } from './promotion.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Admin CRUD de promoção agendada (Épico 15). Mesmo desenho de
 * CouponsController: reaproveita CatalogExceptionFilter (404/409/400
 * genéricos) e `growth.manage` como permissão — promoção é alavanca de
 * crescimento, não ganha permissão própria na matriz, mesmo racional de
 * cupom/combo. Módulo `promotions` — `default: true` em todo plano.
 */
@Controller('v1/admin/promotions')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('promotions')
export class PromotionsController {
  constructor(@Inject(PROMOTION_SERVICE) private readonly promotions: PromotionService) {}

  @Get()
  list() {
    return this.promotions.list();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.promotions.get(id);
    if (!record) throw new NotFoundException('Promoção não encontrada.');
    return record;
  }

  @Post()
  @RequirePermission('growth.manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(createPromotionSchema)) dto: CreatePromotionInput) {
    const input: RepoCreateInput = {
      name: dto.name,
      discountType: dto.discountType,
      discountValue: dto.discountValue,
      weekdays: dto.weekdays,
      startTime: dto.startTime,
      endTime: dto.endTime,
      scope: dto.scope,
      scopeId: dto.scopeId,
    };
    return this.promotions.create(input);
  }

  @Patch(':id')
  @RequirePermission('growth.manage')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updatePromotionSchema)) dto: UpdatePromotionInput) {
    const { version, ...rest } = dto;
    const input: RepoUpdateInput = {
      name: rest.name,
      active: rest.active,
      weekdays: rest.weekdays,
      startTime: rest.startTime,
      endTime: rest.endTime,
    };
    return this.promotions.update(id, version, input);
  }

  @Delete(':id')
  @RequirePermission('growth.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.promotions.delete(id, query.version);
  }
}
