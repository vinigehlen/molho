import { describe, expect, it } from 'vitest';
import { parseImportAvailability, parseImportPriceCents } from './import-price.util';

describe('parseImportPriceCents', () => {
  it('1) formato BR com vírgula decimal: "24,90" -> 2490', () => {
    expect(parseImportPriceCents('24,90')).toBe(2490);
  });

  it('2) formato com ponto decimal: "24.90" -> 2490', () => {
    expect(parseImportPriceCents('24.90')).toBe(2490);
  });

  it('3) milhar com ponto + decimal com vírgula: "1.234,56" -> 123456', () => {
    expect(parseImportPriceCents('1.234,56')).toBe(123456);
  });

  it('4) milhar com vírgula + decimal com ponto: "1,234.56" -> 123456', () => {
    expect(parseImportPriceCents('1,234.56')).toBe(123456);
  });

  it('5) inteiro sem separador: "100" -> 10000', () => {
    expect(parseImportPriceCents('100')).toBe(10000);
  });

  it('6) com símbolo de moeda e espaços: "R$ 24,90" -> 2490', () => {
    expect(parseImportPriceCents('R$ 24,90')).toBe(2490);
  });

  it('7) vazio -> null', () => {
    expect(parseImportPriceCents('')).toBeNull();
    expect(parseImportPriceCents('   ')).toBeNull();
  });

  it('8) texto não numérico -> null', () => {
    expect(parseImportPriceCents('abc')).toBeNull();
  });

  it('9) negativo -> null (dinheiro nunca negativo)', () => {
    expect(parseImportPriceCents('-24,90')).toBeNull();
  });

  it('10) zero é válido', () => {
    expect(parseImportPriceCents('0')).toBe(0);
  });
});

describe('parseImportAvailability', () => {
  it('1) vazio -> true (padrão disponível)', () => {
    expect(parseImportAvailability('')).toBe(true);
  });

  it('2) "sim"/"s"/"yes" -> true', () => {
    expect(parseImportAvailability('sim')).toBe(true);
    expect(parseImportAvailability('S')).toBe(true);
    expect(parseImportAvailability('Yes')).toBe(true);
  });

  it('3) "não"/"nao"/"n" -> false', () => {
    expect(parseImportAvailability('não')).toBe(false);
    expect(parseImportAvailability('nao')).toBe(false);
    expect(parseImportAvailability('N')).toBe(false);
  });

  it('4) valor desconhecido -> null (inválido)', () => {
    expect(parseImportAvailability('talvez')).toBeNull();
  });
});
