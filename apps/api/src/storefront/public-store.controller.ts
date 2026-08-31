import { Body, Controller, Get, Header, HttpCode, Inject, Post, Query, Req, UseGuards, UseInterceptors } from '@nestjs/common';
import type { RequestWithGeocode } from '../geo/geocode.middleware';
import { resolveAddress } from '../geo/resolve-address';
import { RequireModule } from '../auth/guards/require-module.decorator';
import { RequireModuleGuard } from '../auth/guards/require-module.guard';
import { TenantContextInterceptor } from '../auth/guards/tenant-context.interceptor';
import { DeliveryMatchRequestDto } from './dto/delivery-match.dto';
import { StorefrontRateLimitGuard } from './storefront-rate-limit.guard';
import { DELIVERY_MATCH_SERVICE, STOREFRONT_SERVICE } from './storefront.tokens';
import type { DeliveryMatchService } from './delivery-match.service';
import type { StorefrontService } from './storefront.service';

/**
 * A ÚNICA rota sem autenticação do Molho. O `:slug` da URL é o tenant — não
 * há JWT nem header `X-Tenant-Id`, porque quem chama é o cliente final com o
 * link do restaurante no WhatsApp, sem conta nenhuma. Login por OTP só
 * aparece no checkout (Épico 7).
 *
 * Sem `JwtAuthGuard`, de propósito — mas COM `@RequireModule`: o lojista que
 * não tem o canal storefront no plano (ou desligou) não serve cardápio.
 * "Público" é sobre quem pode chamar, nunca sobre pular o gate de módulo.
 *
 * Ordem dos guards importa: o rate limit vem primeiro porque é o mais barato
 * (Redis), então um scraper nunca chega a custar um round-trip de banco pro
 * `RequireModuleGuard`.
 *
 * Isolamento entre tenants continua sendo RLS: `TenantContextInterceptor`
 * resolve o slug e abre o `run()` com `app.tenant_id` já setado, exatamente
 * como nas rotas de backoffice.
 */
@Controller('v1/store')
@UseGuards(StorefrontRateLimitGuard, RequireModuleGuard)
@UseInterceptors(TenantContextInterceptor)
@RequireModule('channel.storefront')
export class PublicStoreController {
  constructor(
    @Inject(STOREFRONT_SERVICE) private readonly storefront: StorefrontService,
    @Inject(DELIVERY_MATCH_SERVICE) private readonly deliveryMatchService: DeliveryMatchService,
  ) {}

  /**
   * `s-maxage=30` cacheia na BORDA (CDN), não no browser do cliente — o
   * lojista que marca um item como esgotado no rush aceita até 30s de atraso,
   * mas não aceitaria minutos. `stale-while-revalidate=60` deixa a borda
   * servir a versão velha enquanto busca a nova por baixo, então nenhum
   * cliente espera a revalidação.
   *
   * Sem `max-age` de propósito: cache privado no browser tornaria "atualizar a
   * página" incapaz de mostrar o item que voltou a ter estoque.
   */
  @Get(':slug')
  @Header('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=60')
  getStorefront(@Query('catalog') catalog?: string) {
    return this.storefront.getStorefront({ catalogOffers: catalog === 'offers' });
  }

  /**
   * `POST`, não `GET` com querystring: lat/lng é dado pessoal de
   * localização, nunca pertence numa URL (CLAUDE.md §Privacidade — nem
   * logs de acesso deveriam carregar isso). `@HttpCode(200)`: não cria
   * recurso nenhum, é uma pergunta ("essa área é atendida?"), o padrão 201
   * do Nest pra POST seria semanticamente errado aqui.
   */
  @Post(':slug/delivery-match')
  @HttpCode(200)
  deliveryMatch(@Body() body: DeliveryMatchRequestDto, @Req() req: RequestWithGeocode) {
    // O endereço já foi resolvido no middleware, FORA da transação de request
    // (CLAUDE.md § Contexto de request). `body` só carrega o fallback de texto.
    return this.deliveryMatchService.match(resolveAddress({ street: '', neighborhood: '', city: '', state: '' }, req.geocoded));
  }
}
