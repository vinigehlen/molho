import type { AdminOrder } from '@molho/contracts';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  INTENT_TTL_MS,
  type QueuedIntent,
  enqueueIntent,
  evaluateIntent,
  isBackwardStaffTransition,
  isLegalStaffTransition,
  loadQueue,
  paymentGateReason,
  removeIntent,
} from './order-queue';

const NOW = 1_700_000_000_000;

function order(status: AdminOrder['status'], over: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: 'o1', status, version: 1, createdAt: '2026-07-27T18:00:00.000Z', customerName: 'X', customerVerified: true,
    paymentMethod: 'pix', paymentStatus: 'confirmado', changeForCents: null,
    subtotalCents: 100, deliveryFeeCents: 0, totalCents: 100, currentTotalCents: null, fulfillmentType: 'delivery', destination: 'delivery',
    delivery: { label: 'C', street: 'R', number: null, complement: null, neighborhood: 'B', city: 'C', state: 'RS', postalCode: null, referencePoint: null, postalCodeVerified: false },
    items: [], ...over, fulfillmentDeadlineAt: over.fulfillmentDeadlineAt ?? null,
    flaggedAt: over.flaggedAt ?? null, flaggedReason: over.flaggedReason ?? null,
  };
}

function intent(over: Partial<QueuedIntent> = {}): QueuedIntent {
  return { orderId: 'o1', fromStatus: 'received', toStatus: 'preparing', expectedVersion: 1, reason: null, idempotencyKey: 'k1', userId: 'u1', enqueuedAt: NOW, ...over };
}

describe('evaluateIntent — precondição semântica', () => {
  it('as 3 precondições OK → apply', () => {
    expect(evaluateIntent(intent(), order('received'), 'u1', NOW).action).toBe('apply');
  });

  it('status mudou (não é mais o que o operador viu) → conflito', () => {
    const r = evaluateIntent(intent(), order('ready'), 'u1', NOW);
    expect(r.action).toBe('conflict');
  });

  it('já está no destino (outra aba/operador aplicou) → drop limpo, não conflito', () => {
    expect(evaluateIntent(intent(), order('preparing'), 'u1', NOW).action).toBe('drop');
  });

  it('intent de OUTRO operador → conflito identificado, nunca auto-aplica', () => {
    const r = evaluateIntent(intent({ userId: 'u2' }), order('received'), 'u1', NOW);
    expect(r).toEqual({ action: 'conflict', reason: 'ação pendente de outro operador' });
  });

  it('intent velho (> TTL) → conflito, mesmo com tudo legal', () => {
    const r = evaluateIntent(intent(), order('received'), 'u1', NOW + INTENT_TTL_MS + 1);
    expect(r.action).toBe('conflict');
    expect((r as { reason: string }).reason).toMatch(/antiga/);
  });

  it('pedido sumiu (null) → conflito', () => {
    expect(evaluateIntent(intent(), null, 'u1', NOW).action).toBe('conflict');
  });

  it('gate §5.5: PIX não confirmado → preparing bloqueia (conflito)', () => {
    const r = evaluateIntent(intent(), order('received', { paymentMethod: 'pix', paymentStatus: 'aguardando_confirmacao' }), 'u1', NOW);
    expect(r).toEqual({ action: 'conflict', reason: 'Confirme o PIX antes de preparar.' });
  });

  it('gate §5.5: cash não confirmado → preparing NÃO bloqueia (apply)', () => {
    const r = evaluateIntent(intent(), order('received', { paymentMethod: 'cash_on_delivery', paymentStatus: 'aguardando_confirmacao' }), 'u1', NOW);
    expect(r.action).toBe('apply');
  });

  it('transição ilegal (received→ready) → conflito', () => {
    const r = evaluateIntent(intent({ toStatus: 'ready' }), order('received'), 'u1', NOW);
    expect(r.action).toBe('conflict');
  });
});

describe('movimentação manual do gestor', () => {
  it.each([
    ['preparing', 'received'],
    ['ready', 'preparing'],
    ['in_transit', 'ready'],
  ] as const)('aceita a regressão adjacente %s → %s e exige o fluxo de retorno', (from, to) => {
    expect(isLegalStaffTransition(from, to)).toBe(true);
    expect(isBackwardStaffTransition(from, to)).toBe(true);
  });

  it('rejeita salto de coluna e não classifica avanço como retorno', () => {
    expect(isLegalStaffTransition('received', 'ready')).toBe(false);
    expect(isBackwardStaffTransition('received', 'preparing')).toBe(false);
  });
});

describe('paymentGateReason', () => {
  it('orienta confirmar o PIX antes de preparar', () => {
    expect(
      paymentGateReason(order('received', { paymentMethod: 'pix', paymentStatus: 'aguardando_confirmacao' }), 'preparing'),
    ).toBe('Confirme o PIX antes de preparar.');
  });

  it('não bloqueia preparo de pedido pós-pago', () => {
    expect(
      paymentGateReason(
        order('received', { paymentMethod: 'cash_on_delivery', paymentStatus: 'aguardando_confirmacao' }),
        'preparing',
      ),
    ).toBeNull();
  });

  it('orienta confirmar o pós-pago antes de concluir', () => {
    expect(
      paymentGateReason(
        order('in_transit', { paymentMethod: 'card_on_delivery', paymentStatus: 'aguardando_confirmacao' }),
        'completed',
      ),
    ).toBe('Confirme o pagamento antes de concluir.');
  });

  it('não bloqueia nenhuma etapa depois da confirmação', () => {
    expect(paymentGateReason(order('received'), 'preparing')).toBeNull();
  });
});

describe('persistência da fila (localStorage por tenant)', () => {
  beforeEach(() => window.localStorage.clear());

  it('enqueue → load devolve; sobrevive a "reload" (releitura)', () => {
    enqueueIntent('t1', intent());
    enqueueIntent('t1', intent({ idempotencyKey: 'k2' }));
    expect(loadQueue('t1').map((i) => i.idempotencyKey)).toEqual(['k1', 'k2']);
    // outro tenant não vê
    expect(loadQueue('t2')).toEqual([]);
  });

  it('remove por chave', () => {
    enqueueIntent('t1', intent());
    enqueueIntent('t1', intent({ idempotencyKey: 'k2' }));
    removeIntent('t1', 'k1');
    expect(loadQueue('t1').map((i) => i.idempotencyKey)).toEqual(['k2']);
  });

  it('storage corrompido → fila vazia, não lança', () => {
    window.localStorage.setItem('molho.order-queue.t1', '{corrompido');
    expect(loadQueue('t1')).toEqual([]);
  });
});
