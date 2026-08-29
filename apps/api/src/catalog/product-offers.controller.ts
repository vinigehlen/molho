import {
  Body,
  Controller,
  Get,
  Inject,
  NotFoundException,
  Param,
  Patch,
  Query,
  Req,
  UseFilters,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { resolveCatalogActor } from './catalog-actor';
import { CatalogExceptionFilter } from './catalog-exception.filter';
import { PRODUCT_OFFER_SERVICE } from './catalog.tokens';
import { SetProductOfferAvailabilityDto, UpdateProductOfferDto } from './dto/product-offer.dto';
import type { ProductOfferService } from './product-offer.service';

/** API de transição do Épico 4B. Só lê/edita ofertas já existentes; criar uma
 * segunda apresentação do mesmo produto fica bloqueado até a UI do 4C poder
 * representá-la sem ambiguidade. */
@Controller('v1/admin/product-offers')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class ProductOffersController {
  constructor(@Inject(PRODUCT_OFFER_SERVICE) private readonly offers: ProductOfferService) {}

  @Get()
  list(@Query('productId') productId?: string, @Query('categoryId') categoryId?: string) {
    return this.offers.list({ productId, categoryId });
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.offers.get(id);
    if (!record) throw new NotFoundException('Oferta não encontrada.');
    return record;
  }

  @Patch(':id')
  @RequirePermission('catalog.product.update')
  update(@Param('id') id: string, @Body() dto: UpdateProductOfferDto, @Req() req: RequestWithUser) {
    const tenantId = requireTenantIdHeader(req);
    const { version, ...input } = dto;
    return this.offers.update(id, version, input, resolveCatalogActor(req, tenantId));
  }

  @Patch(':id/availability')
  @RequirePermission('catalog.product.mark_unavailable')
  setAvailable(@Param('id') id: string, @Body() dto: SetProductOfferAvailabilityDto) {
    return this.offers.setAvailable(id, dto.version, dto.available);
  }
}
