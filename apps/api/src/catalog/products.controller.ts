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
import { PRODUCT_SERVICE } from './catalog.tokens';
import { CreateProductDto, SetProductAvailabilityDto, UpdateProductDto } from './dto/product.dto';
import { VersionQueryDto } from './dto/category.dto';
import type { ProductService } from './product.service';

/** Mesmo desenho de CategoriesController — ver comentários lá pra ordem de guards e ausência de @RequirePermission em GET. */
@Controller('v1/admin/products')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class ProductsController {
  constructor(@Inject(PRODUCT_SERVICE) private readonly products: ProductService) {}

  @Get()
  list(@Query('categoryId') categoryId?: string) {
    if (!categoryId) throw new BadRequestException('Query param categoryId é obrigatório.');
    return this.products.listByCategory(categoryId);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.products.get(id);
    if (!record) throw new NotFoundException('Produto não encontrado.');
    return record;
  }

  @Post()
  @RequirePermission('catalog.product.create')
  create(@Body() dto: CreateProductDto) {
    return this.products.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.product.update')
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    const { version, ...input } = dto;
    return this.products.update(id, version, input);
  }

  /**
   * "Esgotado manual" — endpoint dedicado, permissão separada de update()
   * (§5-C.5: cashier tem mark_unavailable mas não update). Nunca reaproveitar
   * PATCH /:id genérico pra isto, mesmo raciocínio de ProductService.setAvailable.
   */
  @Patch(':id/availability')
  @RequirePermission('catalog.product.mark_unavailable')
  setAvailable(@Param('id') id: string, @Body() dto: SetProductAvailabilityDto) {
    return this.products.setAvailable(id, dto.version, dto.available);
  }

  @Delete(':id')
  @RequirePermission('catalog.product.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.products.delete(id, query.version);
  }
}
