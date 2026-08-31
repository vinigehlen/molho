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
import { MODIFIER_SERVICE } from './catalog.tokens';
import { VersionQueryDto } from './dto/category.dto';
import { CreateModifierDto, ReorderModifiersDto, UpdateModifierDto } from './dto/modifier.dto';
import type { ModifierService } from './modifier.service';
import { resolvePublicImageUrl } from '../storage/public-url';

function withPublicImageUrl<T extends { imageKey: string | null }>(modifier: T) {
  return {
    ...modifier,
    imageUrl: modifier.imageKey
      ? resolvePublicImageUrl(modifier.imageKey, process.env.S3_PUBLIC_URL)
      : null,
  };
}

/** Mesmo raciocínio de ModifierGroupsController: reaproveita catalog.product.{create,update,delete} — sem permissão própria pra "modifier" na matriz. */
@Controller('v1/admin/modifiers')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class ModifiersController {
  constructor(@Inject(MODIFIER_SERVICE) private readonly modifiers: ModifierService) {}

  @Get()
  async list(@Query('groupId') groupId?: string) {
    if (!groupId) throw new BadRequestException('Query param groupId é obrigatório.');
    return (await this.modifiers.listByGroup(groupId)).map(withPublicImageUrl);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.modifiers.get(id);
    if (!record) throw new NotFoundException('Complemento não encontrado.');
    return withPublicImageUrl(record);
  }

  @Post()
  @RequirePermission('catalog.product.create')
  async create(@Body() dto: CreateModifierDto) {
    return withPublicImageUrl(await this.modifiers.create(dto));
  }

  @Patch('reorder')
  @RequirePermission('catalog.product.update')
  async reorder(@Body() dto: ReorderModifiersDto) {
    return (await this.modifiers.reorder(dto.groupId, dto.items)).map(withPublicImageUrl);
  }

  @Patch(':id')
  @RequirePermission('catalog.product.update')
  async update(@Param('id') id: string, @Body() dto: UpdateModifierDto) {
    const { version, ...input } = dto;
    return withPublicImageUrl(await this.modifiers.update(id, version, input));
  }

  @Delete(':id')
  @RequirePermission('catalog.product.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.modifiers.delete(id, query.version);
  }
}
