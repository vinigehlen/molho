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
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { MODIFIER_GROUP_SERVICE } from './catalog.tokens';
import { VersionQueryDto } from './dto/category.dto';
import {
  CopyModifierGroupForProductDto,
  CreateModifierGroupDto,
  LinkModifierGroupDto,
  UpdateModifierGroupDto,
} from './dto/modifier-group.dto';
import type { ModifierGroupService } from './modifier-group.service';

/**
 * Sem permissão própria de "modifier_group" na matriz (§5-C.5/commit 1) — os
 * grupos de complementos são configuração DO PRODUTO (variações), não um
 * recurso próprio na matriz. Reaproveita catalog.product.{create,update,
 * delete}: quem pode criar/editar/apagar produto pode criar/editar/apagar a
 * estrutura de complementos dele. Mesmo desenho de CategoriesController pro
 * resto (guards, ausência de @RequirePermission em GET — ver comentários lá).
 */
@Controller('v1/admin/modifier-groups')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class ModifierGroupsController {
  constructor(@Inject(MODIFIER_GROUP_SERVICE) private readonly modifierGroups: ModifierGroupService) {}

  /**
   * Sem `productId`: lista TODOS os grupos do tenant (aba "Complementos",
   * exceção MVP 2026-08-28) — nunca 400 nesse caso, é o uso normal da aba,
   * só o edit-de-produto passa `productId` pra filtrar.
   */
  @Get()
  list(@Query('productId') productId?: string) {
    return productId ? this.modifierGroups.listByProduct(productId) : this.modifierGroups.listAll();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.modifierGroups.get(id);
    if (!record) throw new NotFoundException('Grupo de complementos não encontrado.');
    return record;
  }

  @Post()
  @RequirePermission('catalog.product.create')
  create(@Body() dto: CreateModifierGroupDto) {
    return this.modifierGroups.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.product.update')
  update(@Param('id') id: string, @Body() dto: UpdateModifierGroupDto) {
    const { version, ...input } = dto;
    return this.modifierGroups.update(id, version, input);
  }

  @Delete(':id')
  @RequirePermission('catalog.product.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.modifierGroups.delete(id, query.version);
  }

  /**
   * Reuso (exceção MVP 2026-08-28, fase 2/4) — vincula um grupo EXISTENTE a
   * outro produto sem recriar. Mesma permissão de criar produto: quem monta
   * cardápio decide o que reaproveitar.
   */
  @Post(':id/products')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async link(@Param('id') id: string, @Body() dto: LinkModifierGroupDto): Promise<void> {
    await this.modifierGroups.link(id, dto.productId);
  }

  @Delete(':id/products/:productId')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.NO_CONTENT)
  async unlink(@Param('id') id: string, @Param('productId') productId: string): Promise<void> {
    await this.modifierGroups.unlink(id, productId);
  }

  @Post(':id/copy-for-product')
  @RequirePermission('catalog.product.update')
  copyForProduct(@Param('id') id: string, @Body() dto: CopyModifierGroupForProductDto) {
    return this.modifierGroups.copyForProduct(id, dto.productId);
  }
}
