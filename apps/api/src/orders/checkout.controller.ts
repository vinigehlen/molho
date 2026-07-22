import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import { CustomerJwtAuthGuard, type RequestWithCustomer } from '../auth/guards/customer-jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { RequestContextService } from '../context/request-context.service';
import { StorefrontRateLimitGuard } from '../storefront/storefront-rate-limit.guard';
import { CheckoutRequestDto } from './dto/checkout-request.dto';
import { OrderExceptionFilter } from './order-exception.filter';
import { CHECKOUT_ORDER_SERVICE, CHECKOUT_REVALIDATION_SERVICE } from './orders.tokens';
import type { CheckoutOrderService } from './checkout-order.service';
import type { CheckoutRevalidationService } from './checkout-revalidation.service';

/**
 * Dois endpoints, MESMO body (`CheckoutRequestDto`) — ver o header de
 * `@molho/contracts/checkout.ts` pro racional completo dos dois papéis.
 */
@Controller('v1/store/:slug/checkout')
@UseInterceptors(TenantContextInterceptor)
@UseFilters(OrderExceptionFilter)
@RequireModule('channel.storefront')
export class CheckoutController {
  constructor(
    @Inject(CHECKOUT_REVALIDATION_SERVICE) private readonly revalidationService: CheckoutRevalidationService,
    @Inject(CHECKOUT_ORDER_SERVICE) private readonly orderService: CheckoutOrderService,
    @Inject(RequestContextService) private readonly requestContext: RequestContextService,
  ) {}

  /**
   * PÚBLICO, anônimo — alimenta a tela de revisão antes do OTP (CLAUDE.md
   * regra 13: endereço/carrinho seguem no `localStorage` até aqui). Mesmo
   * rate limit por (slug+IP) do resto do storefront público — o corpo
   * revela preço/disponibilidade de produto, mesma superfície de scraping.
   */
  @Post('revalidate')
  @UseGuards(StorefrontRateLimitGuard, RequireModuleGuard)
  @HttpCode(HttpStatus.OK)
  revalidate(@Body() dto: CheckoutRequestDto) {
    return this.revalidationService.revalidate(dto);
  }

  /**
   * Autenticado por OTP de cliente (`CustomerJwtAuthGuard`) — só aqui que o
   * endereço anônimo vira linha real em `addresses` e o pedido nasce (regra
   * 13). 409 com o corpo de `RevalidatedCheckout` (não o `{statusCode,
   * message}` padrão do Nest) quando ainda sobra divergência desfavorável
   * na revalidação interna — ver `CheckoutOrderService` pro porquê de não
   * ser uma exceção.
   */
  @Post('orders')
  @UseGuards(CustomerJwtAuthGuard, RequireModuleGuard)
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Body() dto: CheckoutRequestDto,
    @Req() req: RequestWithCustomer,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tenantId = this.requestContext.getTenantId();
    const result = await this.orderService.createOrder(tenantId, req.user.sub, dto);
    if (!result.ok) {
      res.status(HttpStatus.CONFLICT);
      return result.revalidation;
    }
    return result.response;
  }
}
