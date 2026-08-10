import { Body, Controller, HttpCode, HttpStatus, Inject, Post, Req, Res, UseFilters, UseGuards, UseInterceptors } from '@nestjs/common';
import type { Response } from 'express';
import {
  OptionalCustomerJwtAuthGuard,
  type RequestWithOptionalCustomer,
} from '../auth/guards/optional-customer-jwt-auth.guard';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { RequestContextService } from '../context/request-context.service';
import type { RequestWithGeocode } from '../geo/geocode.middleware';
import { resolveAddress } from '../geo/resolve-address';
import { StorefrontRateLimitGuard } from '../storefront/storefront-rate-limit.guard';
import { CheckoutRequestDto, toCheckoutRequest } from './dto/checkout-request.dto';
import { CheckoutOrderRequestDto, toGuestCustomer } from './dto/checkout-order-request.dto';
import { OrderExceptionFilter } from './order-exception.filter';
import { CHECKOUT_ORDER_SERVICE, CHECKOUT_REVALIDATION_SERVICE } from './orders.tokens';
import type { CheckoutOrderService } from './checkout-order.service';
import type { CheckoutRevalidationService } from './checkout-revalidation.service';
import { OrderPublishInterceptor, queueOrderPublish } from './realtime/order-publish.interceptor';

/**
 * Dois endpoints, MESMO body (`CheckoutRequestDto`) — ver o header de
 * `@molho/contracts/checkout.ts` pro racional completo dos dois papéis.
 */
@Controller('v1/store/:slug/checkout')
// OrderPublishInterceptor OUTER do TenantContextInterceptor: flush do cutuque
// 'new' só depois do commit da criação (ver order-publish.interceptor.ts).
@UseInterceptors(OrderPublishInterceptor, TenantContextInterceptor)
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
  revalidate(@Body() dto: CheckoutRequestDto, @Req() req: RequestWithGeocode) {
    const request = toCheckoutRequest(dto);
    // O geocode já rodou no middleware, FORA da transação de request. Cidade
    // conhecida mas não atendida NÃO é erro aqui: sai como 200 com
    // `withinZone: false` (o 422 de endereço irresolúvel morre no middleware).
    return this.revalidationService.revalidate(request, resolveAddress(request.address, req.geocoded));
  }

  /**
   * Só aqui que o endereço anônimo vira linha real em `addresses` e o pedido
   * nasce (regra 13). 409 com o corpo de `RevalidatedCheckout` (não o
   * `{statusCode, message}` padrão do Nest) quando ainda sobra divergência
   * desfavorável na revalidação interna — ver `CheckoutOrderService` pro
   * porquê de não ser uma exceção.
   *
   * `OptionalCustomerJwtAuthGuard`, não `CustomerJwtAuthGuard`: com o módulo
   * `checkout.guest` ligado o pedido nasce sem OTP (regra 13, EMENDA). O guard
   * resolve só a IDENTIDADE — token ausente passa com `req.user` indefinido,
   * token PRESENTE e inválido continua 401. Quem decide se anônimo vale neste
   * tenant é o service, que checa o módulo; o controller não conhece a regra.
   *
   * O cap de escrita pública desta rota (5/10min por slug+IP) é MIDDLEWARE
   * (`CheckoutOrderRateLimitMiddleware`, registrado no `AppModule`), não um
   * guard daqui: guard rodaria depois de todo middleware, ou seja depois do
   * geocode ter feito a chamada externa.
   */
  @Post('orders')
  @UseGuards(OptionalCustomerJwtAuthGuard, RequireModuleGuard)
  @HttpCode(HttpStatus.CREATED)
  async createOrder(
    @Body() dto: CheckoutOrderRequestDto,
    @Req() req: RequestWithOptionalCustomer & RequestWithGeocode,
    @Res({ passthrough: true }) res: Response,
  ) {
    const tenantId = this.requestContext.getTenantId();
    const request = toCheckoutRequest(dto);
    const result = await this.orderService.createOrder(
      tenantId,
      req.user?.sub ?? null,
      request,
      resolveAddress(request.address, req.geocoded),
      toGuestCustomer(dto),
    );
    if (!result.ok) {
      res.status(HttpStatus.CONFLICT);
      return result.revalidation;
    }

    // Enfileira o cutuque de "pedido novo" — flush após o commit da criação
    // (OrderPublishInterceptor). version 0 = pedido recém-nascido.
    queueOrderPublish(req, tenantId, { orderId: result.response.orderId, event: 'new', version: 0 });
    return result.response;
  }
}
