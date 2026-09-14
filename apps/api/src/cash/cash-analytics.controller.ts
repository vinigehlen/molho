import { Controller, Get, Inject, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { parseAnalyticsPeriod } from '../analytics/analytics.controller';
import { CASH_SESSION_SERVICE } from './cash.tokens';
import type { CashSessionService } from './cash-session.service';

type QueryValue = string | string[] | undefined;

/**
 * Corte de análise de caixa (decisão 8 do handoff) — controller SEPARADO de
 * `CashSessionController` (gate `pdv`): este é `cash_register`, mesmo
 * racional de `CmvController` viver ao lado de `AnalyticsController` com
 * módulo próprio.
 */
@Controller('v1/admin/stores/:storeId/analytics/cash-sessions')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('cash_register')
export class CashAnalyticsController {
  constructor(@Inject(CASH_SESSION_SERVICE) private readonly cashSessions: CashSessionService) {}

  @Get()
  @RequirePermission('analytics.read')
  report(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    const { from, to } = parseAnalyticsPeriod(query);
    return this.cashSessions.report(storeId, from, to);
  }
}
