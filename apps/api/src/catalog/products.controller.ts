import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  ServiceUnavailableException,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import type { Response } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { RateLimiter } from '../rate-limit/rate-limiter';
import { STORAGE_PROVIDER, UPLOAD_URL_RATE_LIMITER } from '../storage/storage.module';
import type { StorageProvider } from '../storage/storage-provider.port';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { PRODUCT_SERVICE } from './catalog.tokens';
import { CreateProductDto, SetProductAvailabilityDto, UpdateProductDto } from './dto/product.dto';
import { CreateImageUploadUrlDto } from './dto/product-image.dto';
import { VersionQueryDto } from './dto/category.dto';
import type { ProductService } from './product.service';

const UPLOAD_URL_RATE_LIMIT = 30;
const UPLOAD_URL_RATE_WINDOW_SECONDS = 3600;

/** Mesmo desenho de CategoriesController — ver comentários lá pra ordem de guards e ausência de @RequirePermission em GET. */
@Controller('v1/admin/products')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class ProductsController {
  constructor(
    @Inject(PRODUCT_SERVICE) private readonly products: ProductService,
    @Inject(STORAGE_PROVIDER) private readonly storage: StorageProvider,
    @Inject(UPLOAD_URL_RATE_LIMITER) private readonly rateLimiter: RateLimiter,
  ) {}

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
   * Gera a URL assinada; o cliente faz o PUT direto no R2 (nunca passa pelo
   * nosso servidor) e depois confirma via PATCH /:id com `imageKey`.
   * Permissão catalog.product.update (subir foto é editar o produto).
   *
   * Ordem das checagens: 404 (produto existe no tenant) antes do rate limit
   * — não vale gastar cota de rate limit numa tentativa que já ia falhar por
   * outro motivo, e não faz sentido descobrir rate limit antes de saber se o
   * produto nem existe.
   */
  @Post(':id/image/upload-url')
  @RequirePermission('catalog.product.update')
  @HttpCode(HttpStatus.CREATED)
  async createImageUploadUrl(
    @Param('id') id: string,
    @Body() dto: CreateImageUploadUrlDto,
    @Req() req: RequestWithUser,
    @Res({ passthrough: true }) res: Response,
  ) {
    const record = await this.products.get(id);
    if (!record) throw new NotFoundException('Produto não encontrado.');

    const tenantId = requireTenantIdHeader(req);
    const rateLimitKey = `upload-url:${tenantId}:${req.user.sub}`;
    const withinLimit = await this.rateLimiter.checkAndRecord(
      rateLimitKey,
      UPLOAD_URL_RATE_LIMIT,
      UPLOAD_URL_RATE_WINDOW_SECONDS,
    );
    if (!withinLimit) {
      res.set('Retry-After', '60');
      throw new HttpException(
        { error: 'rate_limited', message: 'Muitas URLs de upload geradas — tente de novo em instantes.' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const presigned = await this.storage.createPresignedUpload({
        tenantId,
        contentType: dto.contentType,
        contentLength: dto.contentLength,
      });
      return {
        uploadUrl: presigned.url,
        key: presigned.key,
        expiresAt: presigned.expiresAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof HttpException) throw error;
      throw new ServiceUnavailableException('Serviço de upload de imagem temporariamente indisponível.');
    }
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
