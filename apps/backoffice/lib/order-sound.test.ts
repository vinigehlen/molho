import { describe, expect, it } from 'vitest';
import { diffNewIds } from './order-sound';

describe('diffNewIds', () => {
  it('devolve só os ids ainda não vistos', () => {
    const seen = new Set(['a', 'b']);
    expect(diffNewIds(seen, ['a', 'b', 'c', 'd'])).toEqual(['c', 'd']);
  });

  it('nada novo → vazio (não toca)', () => {
    expect(diffNewIds(new Set(['a', 'b']), ['a', 'b'])).toEqual([]);
  });

  it('conjunto vazio (1º load ainda não semeado seria tratado à parte) → tudo é novo', () => {
    expect(diffNewIds(new Set(), ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('id que sumiu do board não conta como novo (remoção não toca)', () => {
    expect(diffNewIds(new Set(['a', 'b']), ['a'])).toEqual([]);
  });
});
