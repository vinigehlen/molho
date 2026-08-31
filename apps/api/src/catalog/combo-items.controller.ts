import {
  BadRequestException,
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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { COMBO_ITEM_SERVICE } from './catalog.tokens';
import type { ComboItemService } from './combo-item.service';
import { VersionQueryDto } from './dto/category.dto';
import { CreateComboItemDto, UpdateComboItemDto } from './dto/combo-item.dto';

/**
 * Composição de combo (exceção MVP 2026-08-28, fase 4/4). Módulo `combos`
 * (plans pro/premium, `default: true`) — inerte em tenant sem direito.
 * Permissão `catalog.product.update`: montar o combo É editar o produto-combo,
 * mesmo racional de ModifierGroupsController reaproveitando `catalog.product.*`.
 * Guards/ausência de @RequirePermission em GET seguem CategoriesController.
 */
@Controller('v1/admin/combo-items')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('combos')
export class ComboItemsController {
  constructor(@Inject(COMBO_ITEM_SERVICE) private readonly comboItems: ComboItemService) {}

  @Get()
  list(@Query('comboProductId') comboProductId?: string) {
    if (!comboProductId) throw new BadRequestException('Query param comboProductId é obrigatório.');
    return this.comboItems.listByCombo(comboProductId);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.comboItems.get(id);
    if (!record) throw new NotFoundException('Item do combo não encontrado.');
    return record;
  }

  @Post()
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.CREATED)
  create(@Body() dto: CreateComboItemDto) {
    return this.comboItems.create({
      comboProductId: dto.comboProductId,
      childProductId: dto.childProductId,
      quantity: dto.quantity ?? 1,
      sortOrder: dto.sortOrder,
    });
  }

  @Patch(':id')
  @RequirePermission('catalog.product.update')
  update(@Param('id') id: string, @Body() dto: UpdateComboItemDto) {
    const { version, ...input } = dto;
    return this.comboItems.update(id, version, input);
  }

  @Delete(':id')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.comboItems.delete(id, query.version);
  }
}
