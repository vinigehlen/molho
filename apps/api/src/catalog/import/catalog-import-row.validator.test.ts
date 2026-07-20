import { describe, expect, it } from 'vitest';
import type { RawImportRow } from './catalog-import-parser';
import { validateImportRow } from './catalog-import-row.validator';

function row(overrides: Partial<RawImportRow> = {}): RawImportRow {
  return {
    line: 1,
    categoria: 'Lanches',
    produto: 'X-Burger',
    descricao: 'Pão, carne e queijo',
    preco: '24,90',
    disponivel: 'sim',
    ...overrides,
  };
}

describe('validateImportRow', () => {
  it('1) linha completa e válida não tem erro', () => {
    const result = validateImportRow(row());
    expect(result.error).toBeUndefined();
    expect(result.basePriceCents).toBe(2490);
    expect(result.available).toBe(true);
  });

  it('2) categoria vazia -> erro', () => {
    const result = validateImportRow(row({ categoria: '' }));
    expect(result.error).toContain('categoria é obrigatória');
  });

  it('3) produto vazio -> erro', () => {
    const result = validateImportRow(row({ produto: '' }));
    expect(result.error).toContain('produto é obrigatório');
  });

  it('4) preço inválido -> erro', () => {
    const result = validateImportRow(row({ preco: 'grátis' }));
    expect(result.error).toContain('preço inválido');
  });

  it('5) disponível inválido -> erro', () => {
    const result = validateImportRow(row({ disponivel: 'talvez' }));
    expect(result.error).toContain('disponível deve ser sim/não');
  });

  it('6) múltiplos erros na mesma linha são concatenados', () => {
    const result = validateImportRow(row({ categoria: '', produto: '', preco: '' }));
    expect(result.error).toContain('categoria é obrigatória');
    expect(result.error).toContain('produto é obrigatório');
    expect(result.error).toContain('preço inválido');
  });

  it('7) descricao/disponivel em branco: descricao fica vazia, disponivel vira true', () => {
    const result = validateImportRow(row({ descricao: '', disponivel: '' }));
    expect(result.error).toBeUndefined();
    expect(result.descricao).toBe('');
    expect(result.available).toBe(true);
  });
});
