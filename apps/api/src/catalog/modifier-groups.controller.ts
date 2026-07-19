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
import { MODIFIER_GROUP_SERVICE } from './catalog.tokens';
import { VersionQueryDto } from './dto/category.dto';
import { CreateModifierGroupDto, UpdateModifierGroupDto } from './dto/modifier-group.dto';
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

  @Get()
  list(@Query('productId') productId?: string) {
    if (!productId) throw new BadRequestException('Query param productId é obrigatório.');
    return this.modifierGroups.listByProduct(productId);
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
}
