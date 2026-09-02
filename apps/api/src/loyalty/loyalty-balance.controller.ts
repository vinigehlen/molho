import { Controller, Get, Inject, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import { CustomerJwtAuthGuard, type RequestWithCustomer } from '../auth/guards/customer-jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { LOYALTY_BALANCE_REPOSITORY } from './loyalty.tokens';
import type { LoyaltyBalanceRepository } from './loyalty-balance.repository';

/** Cliente vê o PRÓPRIO saldo de cashback (Épico 16b) — nunca o de outro cliente, mesma identidade do JWT. */
@Controller('v1/store/:slug/me/loyalty')
@UseGuards(CustomerJwtAuthGuard, RequireModuleGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('loyalty')
export class LoyaltyBalanceController {
  constructor(@Inject(LOYALTY_BALANCE_REPOSITORY) private readonly balances: LoyaltyBalanceRepository) {}

  @Get()
  async get(@Req() request: RequestWithCustomer) {
    return { balanceCents: await this.balances.getBalance(request.user.sub) };
  }
}
