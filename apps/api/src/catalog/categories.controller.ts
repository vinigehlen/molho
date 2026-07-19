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
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { CATEGORY_SERVICE } from './catalog.tokens';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import type { CategoryService } from './category.service';
import { CreateCategoryDto, UpdateCategoryDto, VersionQueryDto } from './dto/category.dto';

/**
 * Ordem do array em @UseGuards importa (Nest roda na ordem declarada):
 * JwtAuthGuard popula request.user primeiro; só depois RequirePermissionGuard
 * pode lê-lo. RequireModuleGuard não depende de request.user, mas fica no
 * meio por convenção (módulo antes de permissão específica).
 *
 * @RequireModule('catalog') na classe (catalog é core — sempre ativo, mas o
 * decorator fica por consistência/DoD do CLAUDE.md); @RequirePermission por
 * método, uma das 8 granulares do commit 1.
 */
@Controller('v1/admin/categories')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class CategoriesController {
  constructor(@Inject(CATEGORY_SERVICE) private readonly categories: CategoryService) {}

  // GET sem @RequirePermission de propósito: a matriz (§5-C.5) não tem
  // permissão de "ver cardápio" — só create/update/delete/mark_unavailable/
  // import. Gatear leitura atrás de 'catalog.category.update' bloquearia o
  // cashier (só tem mark_unavailable) de sequer LISTAR o que existe pra
  // marcar esgotado. TenantContextInterceptor já exige que o ator tenha
  // algum papel neste tenant; RequireModuleGuard já exige o módulo ativo —
  // as duas checagens da regra 2 do CLAUDE.md continuam de pé, só que a
  // segunda (permissão) não se aplica a leitura aqui por não existir
  // permissão nesse grão na matriz.
  @Get()
  list() {
    return this.categories.list();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.categories.get(id);
    if (!record) throw new NotFoundException('Categoria não encontrada.');
    return record;
  }

  @Post()
  @RequirePermission('catalog.category.create')
  create(@Body() dto: CreateCategoryDto) {
    return this.categories.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.category.update')
  update(@Param('id') id: string, @Body() dto: UpdateCategoryDto) {
    const { version, ...input } = dto;
    return this.categories.update(id, version, input);
  }

  @Delete(':id')
  @RequirePermission('catalog.category.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.categories.delete(id, query.version);
  }
}
