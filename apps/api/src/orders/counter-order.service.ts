import type { CounterOrderInput, CounterOrderItemInput, CounterOrderResponse } from '@molho/contracts';
import type { OrderStatus } from '@molho/contracts';
import {
  CounterOrderProductNotFoundError,
  CounterOrderStoreNotFoundError,
  MissingIdempotencyKeyError,
  WeighedPriceOutOfRangeError,
} from './counter-order.errors';
import type { CounterOrderRepository, PricedCounterItem } from './counter-order.repository';
import type { OrderStatusRepository } from './order-status.repository';

/** R$5.000 — teto do valor de um item PESADO (POS trust, não confiança no cliente: CLAUDE.md regra 4). */
export const WEIGHED_LINE_MAX_CENTS = 500_000;

export interface CounterOrderActor {
  id: string;
  role: string;
}

interface PricingResult {
  items: PricedCounterItem[];
  subtotalCents: number;
}

export class CounterOrderService {
  constructor(
    private readonly repo: CounterOrderRepository,
    private readonly orderStatusRepo: OrderStatusRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async createOrder(
    tenantId: string,
    storeId: string,
    input: CounterOrderInput,
    idempotencyKey: string | undefined,
    actor: CounterOrderActor,
  ): Promise<CounterOrderResponse> {
    if (!idempotencyKey) throw new MissingIdempotencyKeyError();

    const store = await this.repo.findStore(storeId);
    if (!store) throw new CounterOrderStoreNotFoundError();

    // Fast path do retry: mesma chave, mesmo pedido — nem repriça, nem cria
    // Customer novo à toa. O `ON CONFLICT` em createOrder() é o backstop pra
    // corrida CONCORRENTE de verdade (duas requests quase simultâneas); este
    // check aqui cobre o caso comum (retry sequencial após timeout de rede).
    const existing = await this.repo.findOrderByIdempotencyKey(idempotencyKey);
    if (existing) {
      return {
        orderId: existing.id,
        status: existing.status as OrderStatus,
        paymentStatus: 'confirmado',
        paymentMethod: existing.paymentMethod as CounterOrderResponse['paymentMethod'],
        subtotalCents: existing.subtotalCents,
        totalCents: existing.totalCents,
      };
    }

    const { items, subtotalCents } = await this.priceItems(input.items);

    const customerId = await this.repo.createAnonymousCustomer(input.customerName?.trim() || 'Balcão');
    const createdAt = this.now();
    const { id: orderId, created } = await this.repo.createOrder({
      storeId,
      customerId,
      paymentMethod: input.paymentMethod,
      subtotalCents,
      totalCents: subtotalCents, // feeCents sempre 0 em balcão (pickup) — total = subtotal.
      notes: input.notes?.trim() || null,
      idempotencyKey,
      createdAt,
    });

    if (created) {
      await this.repo.createOrderItems(orderId, items);
      // Ação sensível (dinheiro, CLAUDE.md regra 9) — grava a criação do
      // pedido de balcão já pago, mas ainda ativo na fila do gestor/cozinha.
      // actorId = staff, customerId sempre null (mesma regra de
      // "nunca os dois" do order_status_history — quem criou foi STAFF, não
      // o cliente, mesmo o pedido pertencendo a um Customer anônimo).
      await this.orderStatusRepo.recordHistory({
        tenantId,
        orderId,
        fromStatus: null,
        toStatus: 'received',
        actorId: actor.id,
        actorRole: actor.role,
        customerId: null,
        reason: 'balcão',
      });
      await this.orderStatusRepo.recordAuditLog({
        tenantId,
        actorId: actor.id,
        actorRole: actor.role,
        fromStatus: null,
        toStatus: 'received',
        reason: 'balcão',
      });
    }
    // created === false: perdeu a corrida do ON CONFLICT — quem ganhou já
    // gravou items/history/audit; replay não repete nenhum dos três.

    return {
      orderId,
      status: 'received',
      paymentStatus: 'confirmado',
      paymentMethod: input.paymentMethod,
      subtotalCents,
      totalCents: subtotalCents,
    };
  }

  /**
   * `unit`: preço SEMPRE do catálogo — (basePriceCents + Σ deltas dos
   * modifiers escolhidos) × quantity, mesma fórmula de OrderItem.lineTotalCents
   * em qualquer outro fluxo de pedido. `weighed`: usa `lineTotalCents` como
   * veio (é a balança que sabe peso×preço/kg, não o catálogo), com teto —
   * ponytail: sem validar que o modifier pertence ao MESMO produto (grupo→
   * produto) — balcão é operado por staff já autenticado/autorizado, não por
   * cliente tentando burlar carrinho; upgrade se isto virar superfície
   * pública um dia.
   */
  private async priceItems(items: readonly CounterOrderItemInput[]): Promise<PricingResult> {
    const productIds = [...new Set(items.map((item) => item.productId))];
    const products = await this.repo.findProducts(productIds);

    const modifierIds = [...new Set(items.flatMap((item) => (item.kind === 'unit' ? (item.modifiers ?? []) : [])))];
    const modifiers = modifierIds.length > 0 ? await this.repo.findModifiers(modifierIds) : new Map();

    const priced: PricedCounterItem[] = [];
    let subtotalCents = 0;

    for (const item of items) {
      const product = products.get(item.productId);
      if (!product) throw new CounterOrderProductNotFoundError(item.productId);

      if (item.kind === 'unit') {
        const chosenModifiers = (item.modifiers ?? []).map((modifierId) => {
          const modifier = modifiers.get(modifierId);
          if (!modifier) throw new CounterOrderProductNotFoundError(modifierId);
          return { modifierId, name: modifier.name, priceDeltaCents: modifier.priceDeltaCents };
        });
        const unitBasePriceCents =
          product.basePriceCents + chosenModifiers.reduce((sum, m) => sum + m.priceDeltaCents, 0);
        const lineTotalCents = unitBasePriceCents * item.quantity;
        priced.push({
          productId: item.productId,
          name: product.name,
          unitBasePriceCents,
          quantity: item.quantity,
          notes: null,
          lineTotalCents,
          modifiers: chosenModifiers,
        });
        subtotalCents += lineTotalCents;
        continue;
      }

      // weighed
      if (item.lineTotalCents <= 0 || item.lineTotalCents > WEIGHED_LINE_MAX_CENTS) {
        throw new WeighedPriceOutOfRangeError(item.lineTotalCents, WEIGHED_LINE_MAX_CENTS);
      }
      priced.push({
        productId: item.productId,
        name: product.name,
        unitBasePriceCents: item.lineTotalCents,
        quantity: 1,
        // Snapshot do peso — orders/order_items não têm coluna de peso (só o
        // Épico balcão usa isto hoje); vira nota legível no item em vez de
        // migration nova só pra um número decorativo no recibo.
        notes: `${item.weightGrams}g`,
        lineTotalCents: item.lineTotalCents,
        modifiers: [],
      });
      subtotalCents += item.lineTotalCents;
    }

    return { items: priced, subtotalCents };
  }
}
