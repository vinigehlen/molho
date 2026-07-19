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
import { CreateModifierDto, UpdateModifierDto } from './dto/modifier.dto';
import type { ModifierService } from './modifier.service';

/** Mesmo raciocínio de ModifierGroupsController: reaproveita catalog.product.{create,update,delete} — sem permissão própria pra "modifier" na matriz. */
@Controller('v1/admin/modifiers')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(CatalogExceptionFilter)
@RequireModule('catalog')
export class ModifiersController {
  constructor(@Inject(MODIFIER_SERVICE) private readonly modifiers: ModifierService) {}

  @Get()
  list(@Query('groupId') groupId?: string) {
    if (!groupId) throw new BadRequestException('Query param groupId é obrigatório.');
    return this.modifiers.listByGroup(groupId);
  }

  @Get(':id')
  async get(@Param('id') id: string) {
    const record = await this.modifiers.get(id);
    if (!record) throw new NotFoundException('Complemento não encontrado.');
    return record;
  }

  @Post()
  @RequirePermission('catalog.product.create')
  create(@Body() dto: CreateModifierDto) {
    return this.modifiers.create(dto);
  }

  @Patch(':id')
  @RequirePermission('catalog.product.update')
  update(@Param('id') id: string, @Body() dto: UpdateModifierDto) {
    const { version, ...input } = dto;
    return this.modifiers.update(id, version, input);
  }

  @Delete(':id')
  @RequirePermission('catalog.product.delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(@Param('id') id: string, @Query() query: VersionQueryDto): Promise<void> {
    await this.modifiers.delete(id, query.version);
  }
}
