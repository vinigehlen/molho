import { describe, expect, it } from 'vitest';
import { parseCorsOrigins } from './cors';

describe('parseCorsOrigins', () => {
  it('sem env: cai nos fronts locais de dev', () => {
    expect(parseCorsOrigins(undefined)).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it('lista separada por vírgula vira origens exatas, com trim', () => {
    expect(parseCorsOrigins('https://app.molho.live, https://staging-app.molho.live')).toEqual([
      'https://app.molho.live',
      'https://staging-app.molho.live',
    ]);
  });

  it('string só de vírgulas/espaços cai no default (não vira allowlist vazia = tudo barrado por engano)', () => {
    expect(parseCorsOrigins('  , ,')).toEqual(['http://localhost:3000', 'http://localhost:3001']);
  });

  it('uma origem só', () => {
    expect(parseCorsOrigins('https://app.molho.live')).toEqual(['https://app.molho.live']);
  });
});
