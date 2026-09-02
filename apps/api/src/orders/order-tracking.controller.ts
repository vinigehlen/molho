import { Controller, Get, Inject, NotFoundException, Param, UseGuards, UseInterceptors } from '@nestjs/common';
import { COPY, orderTrackingTokenSchema } from '@molho/contracts';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { ORDER_TRACKING_SERVICE } from './orders.tokens';
import type { OrderTrackingService } from './order-tracking.service';

@Controller('v1/store/:slug/track')
@UseGuards(RequireModuleGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('channel.storefront')
export class OrderTrackingController {
  constructor(@Inject(ORDER_TRACKING_SERVICE) private readonly tracking: OrderTrackingService) {}

  @Get(':token')
  async getTracking(@Param('token') token: string) {
    const parsed = orderTrackingTokenSchema.safeParse(token);
    if (!parsed.success) throw new NotFoundException(COPY.erros.naoEncontrado);

    const order = await this.tracking.findByToken(parsed.data);
    if (!order) throw new NotFoundException(COPY.erros.naoEncontrado);
    return order;
  }
}
