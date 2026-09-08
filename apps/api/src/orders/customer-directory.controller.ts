import { Controller, Get, Inject, Query, Req, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { CustomerSearchResult } from '@molho/contracts';
import { JwtAuthGuard, type RequestWithUser } from '../auth/guards/jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { RequirePermission } from '../auth/guards/require-permission.decorator';
import { RequirePermissionGuard } from '../auth/guards/require-permission.guard';
import { requireTenantIdHeader } from '../auth/guards/tenant-header.util';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import type { CounterOrderService } from './counter-order.service';
import { COUNTER_ORDER_SERVICE } from './orders.tokens';
import { OrderExceptionFilter } from './order-exception.filter';

/**
 * Diretório de clientes do tenant — hoje só o autopreenchimento do balcão
 * (staff digita "Vin" e o sistema oferece "Vinícius Gehlen" com telefone e
 * e-mail já preenchidos). Mesmo gate de `order.create` que o balcão usa: quem
 * bate pedido no caixa é quem consulta o cliente pra ele. Telefone/e-mail vêm
 * decifrados — é staff autorizado com o cliente na frente, mesma exposição do
 * card de pedido no gestor.
 */
@Controller('v1/admin/customers')
@UseGuards(JwtAuthGuard, RequireModuleGuard, RequirePermissionGuard)
@UseInterceptors(TenantContextInterceptor)
@UseFilters(OrderExceptionFilter)
@RequireModule('customers')
export class CustomerDirectoryController {
  constructor(@Inject(COUNTER_ORDER_SERVICE) private readonly counterOrders: CounterOrderService) {}

  @Get('search')
  @RequirePermission('order.create')
  async search(@Query('q') q: string | undefined, @Req() req: RequestWithUser): Promise<CustomerSearchResult[]> {
    requireTenantIdHeader(req);
    return this.counterOrders.searchCustomers(q ?? '');
  }
}
