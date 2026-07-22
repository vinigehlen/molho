import type { CheckoutOrderResponse, CheckoutRequest, RevalidatedCheckout } from '@molho/contracts';
import type { CheckoutRevalidationService } from './checkout-revalidation.service';
import { CheckoutCustomerNotFoundError, CheckoutStoreNotConfiguredError } from './order-errors';
import type { CheckoutOrderRepository } from './checkout-order.repository';
import type { OrderStatusService } from './order-status.service';

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
  ) {}

  async createOrder(tenantId: string, customerId: string, request: CheckoutRequest): Promise<CreateOrderResult> {
    const customer = await this.repo.findCustomer(customerId);
    if (!customer) throw new CheckoutCustomerNotFoundError();

    const storeId = await this.repo.findStoreId();
    if (!storeId) throw new CheckoutStoreNotConfiguredError();

    // Trava as linhas de PRODUTO antes de revalidar — fecha a janela de
    // corrida entre "ler preço/disponibilidade" e "escrever o pedido" pro
    // que tem consequência de dinheiro/consentimento do cliente (CLAUDE.md
    // § Checkout). Qualquer transação concorrente que tente mudar preço ou
    // marcar esgotado um destes produtos fica bloqueada até esta transação
    // commitar ou abortar — o que lemos abaixo fica estável até lá. Zona/
    // horário/mínimo continuam sob READ COMMITTED normal, de propósito
    // (débito documentado: baixa mutabilidade, consequência tolerável).
    const productIds = [...new Set(request.items.map((item) => item.productId))];
    await this.repo.lockProductsForUpdate(productIds);

    // Nunca reaproveita o resultado de /checkout/revalidate — revalida de
    // novo aqui dentro, contra o estado FRESCO do banco (regra 14).
    const revalidation = await this.revalidationService.revalidate(request);
    if (!revalidation.canSubmit || revalidation.hasUnfavorableDivergence) {
      return { ok: false, revalidation };
    }

    const deliveryAddressId = await this.repo.createAddress(customerId, request.address);
    const orderId = await this.repo.createOrder({
      storeId,
      customerId,
      deliveryAddressId,
      address: request.address,
      revalidated: revalidation,
    });
    await this.repo.createOrderItems(orderId, revalidation.items);
    await this.orderStatusService.recordCreation({ orderId, tenantId, customerId });

    return {
      ok: true,
      response: {
        orderId,
        status: 'received',
        paymentStatus: 'aguardando_confirmacao',
        // canSubmit true garante withinZone true garante totalCents não-nulo (ver revalidatedCheckoutSchema).
        totalCents: revalidation.totalCents as number,
      },
    };
  }
}
