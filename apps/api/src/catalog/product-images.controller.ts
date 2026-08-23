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
import { PRODUCT_IMAGE_SERVICE } from './catalog.tokens';
import { VersionQueryDto } from './dto/category.dto';
import { AddProductImageDto, UpdateProductImageDto } from './dto/product-image.dto';
import type { ProductImageService } from './product-image.service';

/**
 * Galeria de fotos do produto (Épico conversão, C1). Aninhado em
 * :productId (não um recurso solto com productId no body) — a foto sempre
 * pertence a UM produto, mesma forma de /admin/modifiers já ser plano mas
 * referenciar groupId; aqui a URL já carrega a relação.
 *
 * Reaproveita catalog.product.{create,update,delete} — mesmo raciocínio de
 * ModifiersController: subir/reordenar/remover foto É editar o produto, não
 * ganha permissão própria na matriz.
 */
@Controller('v1/admin/products/:productId/images')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class ProductImagesController {
  constructor(@Inject(PRODUCT_IMAGE_SERVICE) private readonly images: ProductImageService) {}

  @Get()
  list(@Param('productId') productId: string) {
    return this.images.listByProduct(productId);
  }

  @Post()
  @RequirePermission('catalog.product.update')
  create(@Param('productId') productId: string, @Body() dto: AddProductImageDto) {
    return this.images.add({ productId, imageKey: dto.imageKey, position: dto.position });
  }

  /**
   * Reordenar é um PATCH por linha, uma de cada vez — mesmo padrão de
   * sort_order em Category/Product (CLAUDE.md § schema); não existe endpoint
   * de reorder em lote no catálogo hoje.
   */
  @Patch(':id')
  @RequirePermission('catalog.product.update')
  reorder(@Param('id') id: string, @Body() dto: UpdateProductImageDto) {
    const { version, ...input } = dto;
    return this.images.reorder(id, version, input);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.images.get(id);
    if (!record) throw new NotFoundException('Foto do produto não encontrada.');
    return record;
  }

  @Delete(':id')
  @RequirePermission('catalog.product.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.images.delete(id, query.version);
  }
}
