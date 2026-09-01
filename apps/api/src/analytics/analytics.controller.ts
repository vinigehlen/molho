import { BadRequestException, Controller, Get, Inject, Param, Query, UseGuards, UseInterceptors } from '@nestjs/common';
import type { AnalyticsFulfillment, AnalyticsGranularity, AnalyticsTopItemsSort } from '@molho/contracts';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { AnalyticsPeriod } from './analytics.service';
import { ANALYTICS_SERVICE } from './analytics.tokens';
import type { AnalyticsService } from './analytics.service';

type QueryValue = string | string[] | undefined;

function one(value: QueryValue): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseDate(value: QueryValue, fallback: Date): Date {
  const raw = one(value);
  if (!raw) return fallback;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? new Date(`${raw}T00:00:00.000-03:00`) : new Date(raw);
  if (Number.isNaN(date.getTime())) throw new BadRequestException('Data inválida.');
  return date;
}

function parsePeriod(query: Record<string, QueryValue>): AnalyticsPeriod {
  const toFallback = new Date();
  const fromFallback = new Date(toFallback);
  fromFallback.setDate(fromFallback.getDate() - 30);
  const from = parseDate(query.from, fromFallback);
  const to = parseDate(query.to, toFallback);
  if (from > to) throw new BadRequestException('from precisa ser menor ou igual a to.');
  const fulfillment = one(query.fulfillment);
  if (fulfillment && !['delivery', 'pickup', 'balcao'].includes(fulfillment)) throw new BadRequestException('fulfillment inválido.');
  return { from, to, fulfillment: fulfillment as AnalyticsFulfillment | undefined };
}

function parseLimit(value: QueryValue, fallback: number, max = 100): number {
  const raw = one(value);
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw new BadRequestException('limit inválido.');
  return parsed;
}

@Controller('v1/admin/stores/:storeId/analytics')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('dashboard.basic')
export class AnalyticsController {
  constructor(@Inject(ANALYTICS_SERVICE) private readonly analytics: AnalyticsService) {}

  @Get('overview')
  @RequirePermission('analytics.read')
  overview(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    return this.analytics.overview(storeId, parsePeriod(query));
  }

  @Get('timeseries')
  @RequirePermission('analytics.read')
  timeseries(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    const granularity = one(query.granularity) ?? 'day';
    if (granularity !== 'day' && granularity !== 'month') throw new BadRequestException('granularity inválida.');
    return this.analytics.timeseries(storeId, parsePeriod(query), granularity as AnalyticsGranularity);
  }

  @Get('peak-hours')
  @RequirePermission('analytics.read')
  peakHours(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    return this.analytics.peakHours(storeId, parsePeriod(query));
  }

  @Get('top-items')
  @RequirePermission('analytics.read')
  topItems(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    const sort = one(query.sort) ?? 'qty';
    if (sort !== 'qty' && sort !== 'revenue') throw new BadRequestException('sort inválido.');
    return this.analytics.topItems(storeId, parsePeriod(query), parseLimit(query.limit, 10), sort as AnalyticsTopItemsSort);
  }

  @Get('customers')
  @RequirePermission('analytics.customers.read')
  customers(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    return this.analytics.customers(storeId, parsePeriod(query), parseLimit(query.limit, 10));
  }

  @Get('regions')
  @RequirePermission('analytics.read')
  regions(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    return this.analytics.regions(storeId, parsePeriod(query));
  }

  @Get('idle-items')
  @RequirePermission('analytics.read')
  idleItems(@Param('storeId') storeId: string, @Query() query: Record<string, QueryValue>) {
    return this.analytics.idleItems(storeId, parsePeriod(query));
  }
}
