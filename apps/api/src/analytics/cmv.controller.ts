import { Controller, Get, Inject, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { parseAnalyticsPeriod } from './analytics.controller';
import type { CmvService } from './cmv.service';
import { CMV_SERVICE } from './analytics.tokens';

type QueryValue = string | string[] | undefined;

@Controller('v1/admin/stores/:storeId/analytics/cmv')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('analytics.cmv')
export class CmvController {
  constructor(@Inject(CMV_SERVICE) private readonly cmv: CmvService) {}

  @Get('dashboard')
  @RequirePermission('analytics.read')
  dashboard(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    return this.cmv.dashboard(storeId, parseAnalyticsPeriod(query));
  }

  @Get('ingredients')
  @RequirePermission('analytics.read')
  ingredients() {
    return this.cmv.ingredients();
  }

  @Get('recipes')
  @RequirePermission('analytics.read')
  recipes() {
    return this.cmv.recipes();
  }
}
