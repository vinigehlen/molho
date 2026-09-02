import {
  buildPixBrCode,
  CURRENT_PRIVACY_VERSION,
  CURRENT_TERMS_VERSION,
  parsePhoneNumber,
  PICKUP_ETA_MAX_MINUTES,
} from '@molho/contracts';
import type {
  CheckoutOrderPix,
  CheckoutOrderResponse,
  CheckoutLegalAcceptance,
  CheckoutRequest,
  GuestCustomer,
  RevalidatedCheckout,
} from '@molho/contracts';
import type { CustomerIdentityRepository } from '../auth/customer-identity.repository';
import type { CheckoutGuestGate } from '../modules/checkout-guest.gate';
import type { CheckoutRevalidationService } from './checkout-revalidation.service';
import {
  CheckoutCustomerNotFoundError,
  CheckoutOtpRequiredError,
  CheckoutStoreNotConfiguredError,
  GuestCustomerNotAllowedError,
  GuestCustomerRequiredError,
  InvalidChangeAmountError,
} from './order-errors';
import type { ResolvedAddress } from '../geo/resolve-address';
import { type CheckoutOrderRepository, type StoreForOrder, toDeliverySnapshot } from './checkout-order.repository';
import type { OrderStatusService } from './order-status.service';
import type { PaymentMethodModuleGate } from './payment-method-module-gate';

function isPixKeyType(value: string | null): value is CheckoutOrderPix['keyType'] {
  return value === 'cpf' || value === 'cnpj' || value === 'email' || value === 'phone' || value === 'random';
}

const DEFAULT_LEGAL_ACCEPTANCE: CheckoutLegalAcceptance = {
  termsVersion: CURRENT_TERMS_VERSION,
  privacyVersion: CURRENT_PRIVACY_VERSION,
};

/**
 * Monta o BR Code da loja pra ESTE pedido (Épico 8) — `txid` é o próprio
 * `orderId` sem hífens (uuid v7 tem 32 chars alfanuméricos, cabe nos 25 do
 * campo sem truncar de um jeito que ainda identifique o pedido: os 25
 * primeiros já bastam pra achar no extrato/log, não precisa ser único
 * globalmente pro BR Code em si). Lança CheckoutStoreNotConfiguredError se
 * a loja não tem chave/cidade — mesma natureza de "loja não pronta pra
 * vender" da falta de Store (ver order-errors.ts).
 */
function buildOrderPix(store: StoreForOrder, orderId: string, totalCents: number): CheckoutOrderPix {
  if (!store.pixKey || !isPixKeyType(store.pixKeyType) || !store.pixMerchantCity) {
    throw new CheckoutStoreNotConfiguredError();
  }
  const payload = buildPixBrCode({
    pixKey: store.pixKey,
    merchantName: store.name,
    merchantCity: store.pixMerchantCity,
    amountCents: totalCents,
    txid: orderId.replace(/-/g, ''),
  });
  return { payload, key: store.pixKey, keyType: store.pixKeyType };
}

/**
 * `ok: false` NÃO é uma exceção: ainda existe divergência desfavorável (ou
 * `canSubmit: false` por outro motivo — fora de horário, fora de zona,
 * abaixo do mínimo) na revalidação FRESCA feita aqui dentro — o pedido não é
 * criado, e o corpo devolvido é a MESMA forma de `/checkout/revalidate`, pra
 * a tela de revisão do storefront se atualizar de novo sem outro round-trip
 * (CLAUDE.md regra 14: nunca cria pedido sem confirmação sobre o estado
 * revalidado). Ver nota em `@molho/contracts/checkout.ts` sobre como o
 * cliente precisa reenviar os valores CONFIRMADOS (não os originais do
 * carrinho) nesta segunda chamada.
 */
export type CreateOrderResult = { ok: true; response: CheckoutOrderResponse } | { ok: false; revalidation: RevalidatedCheckout };

export class CheckoutOrderService {
  constructor(
    private readonly repo: CheckoutOrderRepository,
    private readonly revalidationService: CheckoutRevalidationService,
    private readonly orderStatusService: OrderStatusService,
    private readonly moduleGate: PaymentMethodModuleGate,
    private readonly guestGate: CheckoutGuestGate,
    private readonly customerIdentity: CustomerIdentityRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Resolve QUEM é o cliente deste pedido — a única porta por onde um pedido
   * pode nascer sem OTP (CLAUDE.md regra 13, EMENDA).
   *
   * `authenticatedCustomerId` vem do JWT (null = request anônima; token ruim
   * nem chega aqui, morre no guard). `guest` vem do body. As três combinações
   * que não são o caminho feliz são erros DISTINTOS de propósito — cada uma
   * vira um HTTP diferente e uma decisão de UI diferente.
   *
   * Devolve também `verified`, que vira o snapshot `orders.customer_verified`.
   */
  private async resolveCustomer(
    tenantId: string,
    authenticatedCustomerId: string | null,
    guest: GuestCustomer | null,
  ): Promise<{ customerId: string; verified: boolean }> {
    if (authenticatedCustomerId !== null) {
      // Rejeitado, nunca ignorado: descartar o bloco em silêncio deixaria o
      // cliente achar que pediu com o telefone que digitou; aceitá-lo deixaria
      // ele carimbar o pedido no telefone de OUTRA pessoa.
      if (guest) throw new GuestCustomerNotAllowedError();
      const customer = await this.repo.findCustomer(authenticatedCustomerId);
      if (!customer) throw new CheckoutCustomerNotFoundError();
      // Da linha, não do fato de haver token: um customer criado como guest e
      // que só DEPOIS verificou tem que aparecer como verificado aqui.
      return { customerId: customer.id, verified: customer.phoneVerifiedAt !== null };
    }

    // Anônimo: só passa com o módulo ligado. Módulo desligado (o default, e o
    // estado de qualquer tenant sem linha em tenant_settings) = OTP exigido.
    if (!(await this.guestGate.isActive())) throw new CheckoutOtpRequiredError();
    if (!guest) throw new GuestCustomerRequiredError();

    // `parsePhoneNumber` valida DDD real e nono dígito — é o pouco que dá pra
    // afirmar sobre um telefone sem OTP, e é melhor gastar aqui do que
    // descobrir na hora de ligar. Lança se for impossível (vira 400 no filtro
    // de contratos, mesmo caminho do OTP).
    const phone = parsePhoneNumber(guest.phone);
    const { identity } = await this.customerIdentity.findOrCreate(tenantId, phone, {
      name: guest.name,
      verified: false,
    });
    return { customerId: identity.id, verified: false };
  }

  async createOrder(
    tenantId: string,
    authenticatedCustomerId: string | null,
    request: CheckoutRequest,
    /** `null` ⟺ `request.fulfillmentType === 'pickup'` (invariante do controller). */
    resolved: ResolvedAddress | null,
    guest: GuestCustomer | null = null,
    legalAcceptance: CheckoutLegalAcceptance = DEFAULT_LEGAL_ACCEPTANCE,
  ): Promise<CreateOrderResult> {
    const { customerId, verified } = await this.resolveCustomer(tenantId, authenticatedCustomerId, guest);

    const store = await this.repo.findStore();
    if (!store) throw new CheckoutStoreNotConfiguredError();

    // Depende do BODY (paymentMethod), não dá pra checar por @RequireModule
    // estático — ver payment-method-module-gate.ts. Cedo, antes de travar
    // produto/revalidar: sem módulo, não vale gastar o resto do trabalho.
    await this.moduleGate.assertAvailable(tenantId, request.paymentMethod);

    // Trava as linhas de PRODUTO antes de revalidar — fecha a janela de
    // corrida entre "ler preço/disponibilidade" e "escrever o pedido" pro
    // que tem consequência de dinheiro/consentimento do cliente (CLAUDE.md
    // § Checkout). Qualquer transação concorrente que tente mudar preço ou
    // marcar esgotado um destes produtos fica bloqueada até esta transação
    // commitar ou abortar — o que lemos abaixo fica estável até lá. Zona/
    // horário/mínimo continuam sob READ COMMITTED normal, de propósito
    // (débito documentado: baixa mutabilidade, consequência tolerável).
    const requestedProductIds = [...new Set(request.items.map((item) => item.productId))];
    await this.repo.lockProductsForUpdate(requestedProductIds);
    // Combo (fase 4.1b, corrigido antes da 4.2): o pai travado faz INSERT em
    // `combo_items` esperar via FK; travar as linhas vivas da composição
    // serializa quantidade e soft-delete já existentes. Só depois disso os
    // filhos e suas ofertas entram no conjunto estável da revalidação.
    const comboChildProductIds = await this.lockComboTreeProducts(requestedProductIds);
    await this.repo.lockOffersForUpdate([
      ...request.items,
      ...comboChildProductIds.map((productId) => ({ productId })),
    ]);

    // Nunca reaproveita o resultado de /checkout/revalidate — revalida de
    // novo aqui dentro, contra o estado FRESCO do banco (regra 14).
    const revalidation = await this.revalidationService.revalidate(request, resolved);
    if (!revalidation.canSubmit || revalidation.hasUnfavorableDivergence) {
      return { ok: false, revalidation };
    }

    // canSubmit true garante withinZone true garante totalCents não-nulo (ver revalidatedCheckoutSchema).
    const totalCents = revalidation.totalCents as number;

    // Épico conversão (C2). couponValid=true aqui já passou pelas 4
    // checagens de leitura (ativo/validade/mínimo/uso aparente) — mas só o
    // INCREMENTO ATÔMICO abaixo fecha a corrida de verdade (docs/handoff
    // A2, mesmo padrão do optimistic lock de zona). Perder a corrida não é
    // um erro — é o mesmo "divergência desfavorável" de qualquer outra
    // mudança entre revalidar e criar: revalida de novo (fresco, já vê o
    // cupom esgotado) e devolve pro cliente confirmar, nunca cria o pedido
    // fingindo que o desconto ainda vale.
    let couponId: string | null = null;
    let couponCodeSnapshot: string | null = null;
    if (revalidation.couponCode && revalidation.couponValid) {
      const claim = await this.repo.claimCoupon(revalidation.couponCode);
      if (!claim) {
        const fresh = await this.revalidationService.revalidate(request, resolved);
        return { ok: false, revalidation: fresh };
      }
      couponId = claim.couponId;
      couponCodeSnapshot = claim.couponCodeSnapshot;
    }
    const discountCents = couponId ? revalidation.discountCents : 0;

    // Épico conversão (C3). Mesmo racional do cupom acima: scheduledForValid
    // aqui já passou pelas checagens de leitura (horário, slot, teto
    // aparente) — só `claimSchedulingSlot` (advisory lock + contagem fresca)
    // fecha a corrida de verdade. Perder a corrida revalida de novo e
    // devolve pro cliente confirmar, nunca cria o pedido fingindo que o
    // horário ainda tem vaga.
    let scheduledFor: Date | null = null;
    if (revalidation.scheduledFor && revalidation.scheduledForValid) {
      const claimed = await this.repo.claimSchedulingSlot(store.id, store.timezone, new Date(revalidation.scheduledFor));
      if (!claimed) {
        const fresh = await this.revalidationService.revalidate(request, resolved);
        return { ok: false, revalidation: fresh };
      }
      scheduledFor = new Date(revalidation.scheduledFor);
    }

    // Só dá pra validar DEPOIS da revalidação — antes disso não existe
    // totalCents real (docs/02 §5.5: pedir troco pra menos que o total é
    // request inválido).
    const changeForCents = request.paymentMethod === 'cash_on_delivery' ? request.changeForCents : null;
    if (changeForCents !== null && changeForCents < totalCents) {
      throw new InvalidChangeAmountError();
    }

    // Um snapshot só pras DUAS escritas — linha em `addresses` e cópia
    // congelada em `orders` nunca podem divergir. `null` ⟺ pickup: sem
    // endereço de cliente nenhum, então também sem linha em `addresses`
    // (retirada não tem CEP/número — nada pra gravar lá).
    const address = toDeliverySnapshot(request.address, resolved);
    const deliveryAddressId = address ? await this.repo.createAddress(customerId, address) : null;
    const etaMaxMinutes = request.fulfillmentType === 'pickup' ? PICKUP_ETA_MAX_MINUTES : revalidation.etaMaxMinutes;
    if (etaMaxMinutes === null) throw new Error('Checkout de entrega sem prazo máximo revalidado.');
    const createdAt = this.now();
    const fulfillmentDeadlineAt = new Date(createdAt.getTime() + etaMaxMinutes * 60_000);
    const orderId = await this.repo.createOrder({
      storeId: store.id,
      customerId,
      fulfillmentType: request.fulfillmentType,
      deliveryAddressId,
      address,
      revalidated: revalidation,
      paymentMethod: request.paymentMethod,
      changeForCents,
      customerVerified: verified,
      createdAt,
      fulfillmentDeadlineAt,
      couponId,
      couponCodeSnapshot,
      discountCents,
      scheduledFor,
      legalAcceptance,
    });
    await this.repo.createOrderItems(orderId, revalidation.items);
    await this.orderStatusService.recordCreation({ orderId, tenantId, customerId });

    return {
      ok: true,
      response: this.buildResponse(
        request,
        store,
        orderId,
        totalCents,
        changeForCents,
        fulfillmentDeadlineAt,
        discountCents,
        couponCodeSnapshot,
        scheduledFor,
      ),
    };
  }

  private async lockComboTreeProducts(requestedProductIds: readonly string[]): Promise<string[]> {
    const seen = new Set(requestedProductIds);
    const lockedChildren: string[] = [];
    let frontier = [...requestedProductIds];

    // Combo aninhado é limitado a 1 nível (ComboItemService.MAX_NESTED_COMBO_EDGES),
    // então a árvore de trava tem no máximo: filho direto, neto — 2 níveis de
    // `combo_items`. +1 de margem defensiva caso o limite de nesting suba sem
    // este loop ser revisado junto.
    const MAX_COMBO_LOCK_DEPTH = 3;
    for (let depth = 0; depth < MAX_COMBO_LOCK_DEPTH; depth += 1) {
      const childProductIds = await this.repo.lockComboItemsForUpdate(frontier);
      const freshChildIds = childProductIds.filter((productId) => !seen.has(productId));
      if (freshChildIds.length === 0) break;
      freshChildIds.forEach((productId) => seen.add(productId));
      lockedChildren.push(...freshChildIds);
      await this.repo.lockProductsForUpdate(freshChildIds);
      frontier = freshChildIds;
    }

    return lockedChildren;
  }

  /** Espelha a union de `checkoutOrderResponseSchema` — cada branch monta só os campos que existem nela (nunca `pix` fora de `pix`, nunca `changeForCents` fora de `cash_on_delivery`). */
  private buildResponse(
    request: CheckoutRequest,
    store: StoreForOrder,
    orderId: string,
    totalCents: number,
    changeForCents: number | null,
    fulfillmentDeadlineAt: Date,
    discountCents: number,
    couponCodeSnapshot: string | null,
    scheduledFor: Date | null,
  ): CheckoutOrderResponse {
    const base = {
      orderId,
      status: 'received' as const,
      paymentStatus: 'aguardando_confirmacao' as const,
      totalCents,
      discountCents,
      couponCode: couponCodeSnapshot,
      scheduledFor: scheduledFor?.toISOString() ?? null,
      fulfillmentType: request.fulfillmentType,
      fulfillmentDeadlineAt: fulfillmentDeadlineAt.toISOString(),
    };
    if (request.paymentMethod === 'pix') {
      return { ...base, paymentMethod: 'pix', pix: buildOrderPix(store, orderId, totalCents) };
    }
    if (request.paymentMethod === 'cash_on_delivery') {
      return { ...base, paymentMethod: 'cash_on_delivery', changeForCents };
    }
    return { ...base, paymentMethod: 'card_on_delivery' };
  }
}
