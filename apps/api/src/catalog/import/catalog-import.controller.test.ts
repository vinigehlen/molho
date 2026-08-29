import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { assertAllowedImportFileBuffer, assertAllowedImportFileMetadata } from './catalog-import.controller';

describe('CatalogImportController upload guardrails', () => {
  it('aceita CSV por extensão e mimetype esperado', () => {
    expect(() => assertAllowedImportFileMetadata({ originalname: 'cardapio.csv', mimetype: 'text/csv' })).not.toThrow();
    expect(() =>
      assertAllowedImportFileBuffer({
        originalname: 'cardapio.csv',
        buffer: Buffer.from('categoria,produto,descricao,preco,disponivel\nLanches,X,,10,sim'),
      }),
    ).not.toThrow();
  });

  it('aceita XLSX por assinatura ZIP e mimetype esperado', () => {
    expect(() =>
      assertAllowedImportFileMetadata({
        originalname: 'cardapio.xlsx',
        mimetype: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      }),
    ).not.toThrow();
    expect(() =>
      assertAllowedImportFileBuffer({ originalname: 'cardapio.xlsx', buffer: Buffer.from([0x50, 0x4b, 0x03, 0x04]) }),
    ).not.toThrow();
  });

  it('rejeita extensão permitida com mimetype incompatível', () => {
    expect(() =>
      assertAllowedImportFileMetadata({ originalname: 'cardapio.csv', mimetype: 'application/pdf' }),
    ).toThrow(BadRequestException);
  });

  it('rejeita CSV com conteúdo binário ou XLSX sem assinatura ZIP', () => {
    expect(() =>
      assertAllowedImportFileBuffer({ originalname: 'cardapio.csv', buffer: Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00]) }),
    ).toThrow(BadRequestException);
    expect(() =>
      assertAllowedImportFileBuffer({ originalname: 'cardapio.xlsx', buffer: Buffer.from('não é xlsx') }),
    ).toThrow(BadRequestException);
  });
});

