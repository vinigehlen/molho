import { describe, expect, it } from 'vitest';
import { isLegalOrderTransition, orderTransitionRequiresReason, type OrderStatus } from './order-status-machine';

const ALL_STATUSES: OrderStatus[] = [
  'pending_payment',
  'received',
  'preparing',
  'ready',
  'in_transit',
  'completed',
  'expired',
  'auto_canceled',
  'canceled',
  'delivery_failed',
];

describe('isLegalOrderTransition — docs/02-definicoes-v1.md §5.1/§5.2', () => {
  const LEGAL: Array<[OrderStatus, OrderStatus]> = [
    ['pending_payment', 'received'],
    ['pending_payment', 'expired'],
    ['received', 'preparing'],
    ['received', 'canceled'],
    ['received', 'auto_canceled'],
    ['preparing', 'ready'],
    ['preparing', 'received'],
    ['preparing', 'canceled'],
    ['ready', 'in_transit'],
    ['ready', 'completed'],
    ['ready', 'preparing'],
    ['in_transit', 'completed'],
    ['in_transit', 'ready'],
    ['in_transit', 'delivery_failed'],
  ];

  it.each(LEGAL)('%s → %s é legal', (from, to) => {
    expect(isLegalOrderTransition(from, to)).toBe(true);
  });

  it('nenhum estado terminal (completed/expired/auto_canceled/canceled/delivery_failed) tem transição de saída', () => {
    const terminals: OrderStatus[] = ['completed', 'expired', 'auto_canceled', 'canceled', 'delivery_failed'];
    for (const from of terminals) {
      for (const to of ALL_STATUSES) {
        expect(isLegalOrderTransition(from, to)).toBe(false);
      }
    }
  });

  it('ready e in_transit não aceitam cancelamento — docs/02 §5.2 só permite até preparing', () => {
    expect(isLegalOrderTransition('ready', 'canceled')).toBe(false);
    expect(isLegalOrderTransition('in_transit', 'canceled')).toBe(false);
  });

  it('nenhum estado transiciona pra si mesmo', () => {
    for (const status of ALL_STATUSES) {
      expect(isLegalOrderTransition(status, status)).toBe(false);
    }
  });

  it('cobertura exaustiva: toda combinação fora da lista LEGAL é ilegal', () => {
    const legalSet = new Set(LEGAL.map(([from, to]) => `${from}->${to}`));
    for (const from of ALL_STATUSES) {
      for (const to of ALL_STATUSES) {
        const expected = legalSet.has(`${from}->${to}`);
        expect(isLegalOrderTransition(from, to)).toBe(expected);
      }
    }
  });
});

describe('orderTransitionRequiresReason', () => {
  it('exige motivo pra canceled, delivery_failed e regressões operacionais', () => {
    expect(orderTransitionRequiresReason('received', 'canceled')).toBe(true);
    expect(orderTransitionRequiresReason('in_transit', 'delivery_failed')).toBe(true);
    expect(orderTransitionRequiresReason('preparing', 'received')).toBe(true);
    expect(orderTransitionRequiresReason('ready', 'preparing')).toBe(true);
    expect(orderTransitionRequiresReason('in_transit', 'ready')).toBe(true);
  });

  it('não exige motivo nos avanços normais', () => {
    expect(orderTransitionRequiresReason('received', 'preparing')).toBe(false);
    expect(orderTransitionRequiresReason('preparing', 'ready')).toBe(false);
    expect(orderTransitionRequiresReason('ready', 'in_transit')).toBe(false);
    expect(orderTransitionRequiresReason('ready', 'completed')).toBe(false);
    expect(orderTransitionRequiresReason('in_transit', 'completed')).toBe(false);
  });
});
