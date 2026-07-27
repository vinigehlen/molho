import { describe, expect, it } from 'vitest';
import { immediateJitter, nextBackoffDelay } from './backoff';

describe('nextBackoffDelay', () => {
  it('teto cresce exponencial (base 1s, 2^attempt) — rng=1 devolve o teto', () => {
    const one = () => 1;
    expect(nextBackoffDelay(0, one)).toBe(1000); // 1s·2^0
    expect(nextBackoffDelay(1, one)).toBe(2000);
    expect(nextBackoffDelay(2, one)).toBe(4000);
    expect(nextBackoffDelay(3, one)).toBe(8000);
  });

  it('satura no cap de 30s', () => {
    expect(nextBackoffDelay(20, () => 1)).toBe(30000);
  });

  it('full jitter: rng=0 → 0 (reconexões espalhadas de 0 até o teto)', () => {
    expect(nextBackoffDelay(5, () => 0)).toBe(0);
  });

  it('attempt negativo não quebra (trata como 0)', () => {
    expect(nextBackoffDelay(-3, () => 1)).toBe(1000);
  });

  it('immediateJitter fica entre 0 e 1s (não empilha todos no mesmo instante)', () => {
    expect(immediateJitter(() => 0)).toBe(0);
    expect(immediateJitter(() => 0.999)).toBe(999);
  });
});
