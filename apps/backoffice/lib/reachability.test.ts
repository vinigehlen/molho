import { beforeEach, describe, expect, it } from 'vitest';
import { getReachability, markReachable, markUnreachable } from './reachability';

beforeEach(() => markReachable()); // reseta pra online

describe('reachability', () => {
  it('começa/volta online; markUnreachable derruba', () => {
    expect(getReachability()).toBe(true);
    markUnreachable();
    expect(getReachability()).toBe(false);
    markReachable();
    expect(getReachability()).toBe(true);
  });

  it('marcar o mesmo valor repetido é idempotente', () => {
    markReachable();
    markReachable();
    expect(getReachability()).toBe(true);
    markUnreachable();
    markUnreachable();
    expect(getReachability()).toBe(false);
  });
});
