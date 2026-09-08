import { describe, expect, it } from 'vitest';
import { DEGRADED_POLL_INTERVAL_MS, isBoardDegraded } from './use-orders-poll';

describe('isBoardDegraded', () => {
  it('sem tenant nunca é degradado (nada a pedir)', () => {
    expect(isBoardDegraded(null, 'connecting', true)).toBe(false);
    expect(isBoardDegraded(null, 'reconnecting', true)).toBe(false);
  });

  it('stream open não é degradado — tempo real já entrega', () => {
    expect(isBoardDegraded('t1', 'open', true)).toBe(false);
  });

  it('REST inalcançável não é degradado — é "sem conexão" (fila offline)', () => {
    expect(isBoardDegraded('t1', 'connecting', false)).toBe(false);
    expect(isBoardDegraded('t1', 'reconnecting', false)).toBe(false);
  });

  it('tenant + stream fora de open + REST alcançável = degradado (polling liga)', () => {
    expect(isBoardDegraded('t1', 'connecting', true)).toBe(true);
    expect(isBoardDegraded('t1', 'reconnecting', true)).toBe(true);
  });

  it('intervalo é frouxo (rede de segurança, não caminho quente)', () => {
    expect(DEGRADED_POLL_INTERVAL_MS).toBeGreaterThanOrEqual(10_000);
  });
});
