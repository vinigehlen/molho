import { NotFoundException } from '@nestjs/common';
import type { StorefrontPayload } from '@molho/contracts';
import { otpChannelFor } from '../messaging/otp-channel';
import { resolvePublicImageUrl } from '../storage/public-url';
import type { CheckoutGuestGate } from '../modules/checkout-guest.gate';
import type { AvailablePaymentMethodsResolver } from './available-payment-methods';
import type { StorefrontRepository } from './storefront.repository';
import { computeStoreOpenState } from './store-hours';

/**
 * Monta o payload público do cardápio (contrato em
 * `@molho/contracts/storefront.ts`).
 *
 * A única regra de negócio aqui é a de EXIBIÇÃO: o que o cliente final pode
 * ver e em que forma. Isolamento entre tenants não é decidido neste arquivo —
 * é RLS, uma camada abaixo.
 */
export class StorefrontService {
  constructor(
    private readonly repository: StorefrontRepository,
    /** `S3_PUBLIC_URL`. Vazia = bucket sem leitura pública; toda foto vira `null`. */
    private readonly publicImageBaseUrl: string | undefined,
    private readonly paymentMethods: AvailablePaymentMethodsResolver,
    private readonly guestGate: CheckoutGuestGate,
  ) {}

  async getStorefront(): Promise<StorefrontPayload> {
    const [tenant, store, categories, hours] = await Promise.all([
      this.repository.findTenant(),
      this.repository.findStore(),
      this.repository.listMenu(),
      this.repository.listStoreHours(),
    ]);
    const availablePaymentMethods = await this.paymentMethods.list(store);
    const guestCheckout = await this.guestGate.isActive();

    // O slug já resolveu pra um tenant no interceptor, então não achar o
    // tenant aqui significa que ele foi soft-deletado entre uma coisa e
    // outra. 404 é a resposta honesta.
    if (!tenant) throw new NotFoundException('Loja não encontrada.');

    // Timezone da LOJA (Store.timezone), não do tenant — são campos
    // diferentes no schema; "aberto agora" é sobre o horário de
    // funcionamento da loja física. Sem loja cadastrada ainda, cai no
    // timezone do tenant (mesmo fallback do resto deste método).
    const { isOpenNow, nextOpensAt } = computeStoreOpenState(hours, store?.timezone ?? tenant.timezone);

    return {
      store: {
        slug: tenant.slug,
        name: tenant.name,
        themeKey: tenant.themeKey,
        timezone: tenant.timezone,
        // Loja ainda não cadastrada (tenant recém-criado no wizard, Épico 13):
        // o cardápio já pode existir, então respondemos o que temos em vez de
        // 404 — o cabeçalho apenas omite endereço/telefone.
        addressText: store?.addressText ?? null,
        phone: store?.phone ?? null,
        whatsappNumber: store?.whatsappNumber ?? null,
        minOrderCents: store?.minOrderCents ?? 0,
        isOpenNow,
        nextOpensAt,
        availablePaymentMethods,
      },
      // Backend é fonte única do canal de OTP — o front NÃO tem env própria
      // pra isso (duas fontes divergiriam num deploy e o login pararia sem
      // ninguém entender). Ver docs/08 § fiação.
      otpChannel: otpChannelFor('customer'),
      // Dica de UI, NUNCA gate: o servidor recusa igual se o front mentir
      // (CLAUDE.md regra 13, EMENDA). Vem daqui e não de uma `NEXT_PUBLIC_*`
      // pelo mesmo motivo do otpChannel — fonte única —, com a diferença de
      // que este JÁ é config por tenant de verdade.
      guestCheckout,
      categories: categories.map((category) => ({
        id: category.id,
        name: category.name,
        products: category.products.map((product) => {
          // Galeria (Épico conversão, C1). Produto que nunca migrou pra
          // ProductImage (ou nasceu antes do C1) cai no fallback do
          // imageKey único, na frente da galeria vazia — nunca um produto
          // com foto vira "sem foto" só porque a linha em product_images
          // ainda não existe.
          const galleryKeys = product.images.length > 0 ? product.images.map((img) => img.imageKey) : product.imageKey ? [product.imageKey] : [];
          const images = galleryKeys
            .map((key) => resolvePublicImageUrl(key, this.publicImageBaseUrl))
            .filter((url): url is string => url !== null);

          return {
            id: product.id,
            name: product.name,
            description: product.description,
            basePriceCents: product.basePriceCents,
            /** Capa: primeira foto da galeria resolvida, `null` = produto sem foto nenhuma. */
            imageUrl: images[0] ?? null,
            images: images.map((url) => ({ url })),
            available: product.available,
            modifierGroups: product.modifierGroups.map((group) => ({
              id: group.id,
              name: group.name,
              min: group.min,
              max: group.max,
              modifiers: group.modifiers.map((modifier) => ({
                id: modifier.id,
                name: modifier.name,
                priceDeltaCents: modifier.priceDeltaCents,
              })),
            })),
          };
        }),
      })),
    };
  }
}
