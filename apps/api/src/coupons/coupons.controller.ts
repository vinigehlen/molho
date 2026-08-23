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
  createCouponSchema,
  type CreateCouponInput,
  updateCouponSchema,
  type UpdateCouponInput,
} from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { CatalogExceptionFilter } from '../catalog/catalog-exception.filter';
import { VersionQueryDto } from '../catalog/dto/category.dto';
import { COUPON_SERVICE } from './coupon.tokens';
import type { CreateCouponInput as RepoCreateInput, UpdateCouponInput as RepoUpdateInput } from './coupon.repository';
import type { CouponService } from './coupon.service';
import { ZodValidationPipe } from './zod-validation.pipe';

/**
 * Admin CRUD de cupom (Épico conversão, C2). Reaproveita CatalogExceptionFilter
 * (404/409/400 genéricos — ver comentário lá) e `growth.manage` como
 * permissão (mesmo racional de ModifiersController reaproveitando
 * catalog.product.*: cupom É uma alavanca de crescimento, não ganha
 * permissão própria na matriz). Módulo `coupons` — gateado (plans
 * pro/premium), inerte em qualquer tenant no plano do MVP.
 */
@Controller('v1/admin/coupons')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('coupons')
export class CouponsController {
  constructor(@Inject(COUPON_SERVICE) private readonly coupons: CouponService) {}

  @Get()
  list() {
    return this.coupons.list();
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.coupons.get(id);
    if (!record) throw new NotFoundException('Cupom não encontrado.');
    return record;
  }

  @Post()
  @RequirePermission('growth.manage')
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(createCouponSchema)) dto: CreateCouponInput) {
    const input: RepoCreateInput = {
      code: dto.code,
      discountType: dto.discountType,
      discountPercent: dto.discountPercent,
      discountValueCents: dto.discountValueCents,
      minOrderCents: dto.minOrderCents,
      startsAt: new Date(dto.startsAt),
      endsAt: new Date(dto.endsAt),
      maxUses: dto.maxUses,
    };
    return this.coupons.create(input);
  }

  @Patch(':id')
  @RequirePermission('growth.manage')
  update(@Param('id') id: string, @Body(new ZodValidationPipe(updateCouponSchema)) dto: UpdateCouponInput) {
    const { version, ...rest } = dto;
    const input: RepoUpdateInput = {
      active: rest.active,
      minOrderCents: rest.minOrderCents,
      startsAt: rest.startsAt ? new Date(rest.startsAt) : undefined,
      endsAt: rest.endsAt ? new Date(rest.endsAt) : undefined,
      maxUses: rest.maxUses,
    };
    return this.coupons.update(id, version, input);
  }

  @Delete(':id')
  @RequirePermission('growth.manage')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.coupons.delete(id, query.version);
  }
}
