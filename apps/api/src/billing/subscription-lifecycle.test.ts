import { describe, expect, it } from 'vitest';
import {
  computePendingTransition,
  isAccessBlocked,
  SUBSCRIPTION_GRACE_PERIOD_DAYS,
  type SubscriptionSnapshot,
} from './subscription-lifecycle';

const NOW = new Date('2026-09-08T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function snapshot(overrides: Partial<SubscriptionSnapshot> = {}): SubscriptionSnapshot {
  return {
    status: 'trial',
    trialEndsAt: null,
    currentPeriodEndsAt: null,
    pastDueAt: null,
    ...overrides,
  };
}

describe('computePendingTransition — trial', () => {
  it('trial ainda dentro do prazo: sem transição', () => {
    const snap = snapshot({ status: 'trial', trialEndsAt: new Date(NOW.getTime() + DAY_MS) });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });

  it('trial expirado: vai direto pra suspended, SEM passar por past_due (trial não é inadimplência)', () => {
    const snap = snapshot({ status: 'trial', trialEndsAt: new Date(NOW.getTime() - 1) });
    expect(computePendingTransition(snap, NOW)).toEqual({ toStatus: 'suspended', patch: {} });
  });

  it('trial exatamente no instante do prazo (now === trialEndsAt): já conta como expirado', () => {
    const snap = snapshot({ status: 'trial', trialEndsAt: NOW });
    expect(computePendingTransition(snap, NOW)).toEqual({ toStatus: 'suspended', patch: {} });
  });

  it('trial sem trialEndsAt (defensivo, não deveria existir): nunca expira sozinho', () => {
    const snap = snapshot({ status: 'trial', trialEndsAt: null });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });
});

describe('computePendingTransition — active', () => {
  it('período corrente ainda válido: sem transição', () => {
    const snap = snapshot({ status: 'active', currentPeriodEndsAt: new Date(NOW.getTime() + DAY_MS) });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });

  it('período expirado: vira past_due, gravando pastDueAt=now (âncora fixa da folga)', () => {
    const snap = snapshot({ status: 'active', currentPeriodEndsAt: new Date(NOW.getTime() - 1) });
    expect(computePendingTransition(snap, NOW)).toEqual({ toStatus: 'past_due', patch: { pastDueAt: NOW } });
  });

  it('active com currentPeriodEndsAt null (venda assistida, immediate=true, sem relógio de cobrança ainda): nunca expira sozinho', () => {
    const snap = snapshot({ status: 'active', currentPeriodEndsAt: null });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });
});

describe('computePendingTransition — past_due', () => {
  it('dentro da folga de 7 dias: continua past_due, sem transição', () => {
    const snap = snapshot({ status: 'past_due', pastDueAt: new Date(NOW.getTime() - DAY_MS) });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });

  it(`exatamente ${SUBSCRIPTION_GRACE_PERIOD_DAYS} dias depois de pastDueAt: já suspende`, () => {
    const pastDueAt = new Date(NOW.getTime() - SUBSCRIPTION_GRACE_PERIOD_DAYS * DAY_MS);
    const snap = snapshot({ status: 'past_due', pastDueAt });
    expect(computePendingTransition(snap, NOW)).toEqual({ toStatus: 'suspended', patch: {} });
  });

  it('um dia antes de completar a folga: ainda não suspende', () => {
    const pastDueAt = new Date(NOW.getTime() - (SUBSCRIPTION_GRACE_PERIOD_DAYS - 1) * DAY_MS);
    const snap = snapshot({ status: 'past_due', pastDueAt });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });

  it('past_due sem pastDueAt gravado (defensivo, nunca deveria acontecer): não trava a suíte inteira, só não transiciona', () => {
    const snap = snapshot({ status: 'past_due', pastDueAt: null });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });
});

describe('computePendingTransition — estados terminais pra automação', () => {
  it('suspended nunca transiciona sozinho (só sai via markPaid manual)', () => {
    const snap = snapshot({ status: 'suspended', trialEndsAt: new Date(0), currentPeriodEndsAt: new Date(0), pastDueAt: new Date(0) });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });

  it('canceled nunca transiciona sozinho (definitivo)', () => {
    const snap = snapshot({ status: 'canceled', trialEndsAt: new Date(0), currentPeriodEndsAt: new Date(0), pastDueAt: new Date(0) });
    expect(computePendingTransition(snap, NOW)).toBeNull();
  });
});

describe('isAccessBlocked', () => {
  it('bloqueia suspended e canceled', () => {
    expect(isAccessBlocked('suspended')).toBe(true);
    expect(isAccessBlocked('canceled')).toBe(true);
  });

  it('libera trial, active e past_due — past_due é aviso, não bloqueio', () => {
    expect(isAccessBlocked('trial')).toBe(false);
    expect(isAccessBlocked('active')).toBe(false);
    expect(isAccessBlocked('past_due')).toBe(false);
  });
});
