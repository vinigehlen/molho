import { Body, Controller, Get, HttpCode, HttpStatus, Inject, Post, UseGuards, UseInterceptors } from '@nestjs/common';
import { createStoreSchema, type CreateStoreInput, type StoreSummary } from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { RequestContextService } from '../context/request-context.service';
import { ZodValidationPipe } from '../platform/zod-validation.pipe';
import { STORE_ADMIN_SERVICE } from './store-admin.tokens';
import type { StoreAdminService } from './store-admin.service';

/**
 * Criar/listar loja do tenant (multi_store, plano premium). `module.toggle`
 * (decisão de reuso, mesmo padrão de team.manage em print-device-admin: abrir
 * mais uma loja é decisão de estrutura do negócio, mesmo nível de
 * exclusividade owner-only de ligar/desligar módulo — sem permissão nova).
 */
@Controller('v1/admin/stores')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('multi_store')
@RequirePermission('module.toggle')
export class StoreAdminController {
  constructor(
    @Inject(STORE_ADMIN_SERVICE) private readonly stores: StoreAdminService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  @Get()
  list(): Promise<StoreSummary[]> {
    return this.stores.list(this.requestContext.getTenantId());
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  create(@Body(new ZodValidationPipe(createStoreSchema)) dto: CreateStoreInput): Promise<StoreSummary> {
    return this.stores.create(dto, this.requestContext.getTenantId());
  }
}
