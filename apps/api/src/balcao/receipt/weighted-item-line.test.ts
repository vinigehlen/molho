import { describe, expect, it } from 'vitest';
import { formatWeightedItemLine } from './weighted-item-line';

describe('formatWeightedItemLine', () => {
  it('formata item por peso com kg, preço por kg e total já resolvido', () => {
    expect(
      formatWeightedItemLine({
        itemName: 'Picanha fatiada',
        weightGrams: 1250,
        pricePerKgCents: 8990,
        totalCents: 11238,
      }),
    ).toBe('Picanha fatiada — 1,250 kg × R$ 89,90/kg = R$ 112,38');
  });

  it('formata item por preço direto', () => {
    expect(formatWeightedItemLine({ itemName: 'Bandeja pronta', priceCents: 2590 })).toBe('Bandeja pronta — R$ 25,90');
  });

  it('mantém centavos em pt-BR com R$', () => {
    expect(formatWeightedItemLine({ itemName: 'Queijo', priceCents: 5 })).toBe('Queijo — R$ 0,05');
  });

  it('exibe gramas como kg com tres casas', () => {
    expect(
      formatWeightedItemLine({
        itemName: 'Mortadela',
        weightGrams: 75,
        pricePerKgCents: 2990,
        totalCents: 224,
      }),
    ).toContain('0,075 kg');
  });

  it('não arredonda valores inteiros recebidos da camada superior', () => {
    expect(
      formatWeightedItemLine({
        itemName: 'Carne moída',
        weightGrams: 333,
        pricePerKgCents: 1999,
        totalCents: 666,
      }),
    ).toBe('Carne moída — 0,333 kg × R$ 19,99/kg = R$ 6,66');
  });

  it('normaliza nome longo sem quebrar ou truncar', () => {
    const longName = '  Coxão   mole bovino resfriado peça inteira maturada embalagem família  ';

    expect(formatWeightedItemLine({ itemName: longName, priceCents: 123456 })).toBe(
      'Coxão mole bovino resfriado peça inteira maturada embalagem família — R$ 1.234,56',
    );
  });

  it('não inclui PII quando o nome do item é comum', () => {
    const line = formatWeightedItemLine({
      itemName: 'Linguiça artesanal',
      weightGrams: 500,
      pricePerKgCents: 3990,
      totalCents: 1995,
    });

    expect(line).not.toMatch(/telefone|endereço|cpf|cliente/i);
  });

  it('rejeita dinheiro fracionado porque centavos são inteiros', () => {
    expect(() => formatWeightedItemLine({ itemName: 'Queijo', priceCents: 10.5 })).toThrow(/inteiro não negativo/);
  });

  it('rejeita peso negativo', () => {
    expect(() =>
      formatWeightedItemLine({
        itemName: 'Presunto',
        weightGrams: -1,
        pricePerKgCents: 2990,
        totalCents: 100,
      }),
    ).toThrow(/inteiro não negativo/);
  });
});
