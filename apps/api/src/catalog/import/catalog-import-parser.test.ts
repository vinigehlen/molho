import { describe, expect, it } from 'vitest';
import { buildImportTemplate } from './catalog-import-template';
import { parseImportFile } from './catalog-import-parser';

describe('parseImportFile', () => {
  it('1) CSV com acento pt-BR não vira mojibake (codepage UTF-8 explícito)', () => {
    const csv = 'categoria,produto,descricao,preco,disponivel\nLanches,X-Burger,Pão com maionese,24,90,sim\n';
    const rows = parseImportFile(Buffer.from(csv, 'utf-8'));

    expect(rows).toHaveLength(1);
    expect(rows[0]?.categoria).toBe('Lanches');
    expect(rows[0]?.produto).toBe('X-Burger');
    expect(rows[0]?.descricao).toContain('Pão');
  });

  it('2) cabeçalho com capitalização diferente é normalizado (Categoria vs categoria)', () => {
    const csv = 'Categoria,Produto,Descricao,Preco,Disponivel\nBebidas,Suco,,6.00,sim\n';
    const rows = parseImportFile(Buffer.from(csv, 'utf-8'));

    expect(rows[0]?.categoria).toBe('Bebidas');
    expect(rows[0]?.produto).toBe('Suco');
  });

  it('3) múltiplas linhas mantêm numeração 1-based', () => {
    const csv = 'categoria,produto,descricao,preco,disponivel\nA,P1,,1,sim\nB,P2,,2,sim\nC,P3,,3,sim\n';
    const rows = parseImportFile(Buffer.from(csv, 'utf-8'));

    expect(rows.map((r) => r.line)).toEqual([1, 2, 3]);
  });

  it('4) round-trip com o próprio template gerado (XLSX binário)', () => {
    const template = buildImportTemplate();
    const rows = parseImportFile(template);

    expect(rows).toHaveLength(1);
    expect(rows[0]?.categoria).toBe('Lanches');
    expect(rows[0]?.produto).toBe('X-Burger');
    expect(rows[0]?.preco).toBe('24,90');
  });

  it('5) planilha vazia (só cabeçalho) devolve array vazio', () => {
    const csv = 'categoria,produto,descricao,preco,disponivel\n';
    const rows = parseImportFile(Buffer.from(csv, 'utf-8'));
    expect(rows).toEqual([]);
  });
});
