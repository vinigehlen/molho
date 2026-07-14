import { describe, expect, it } from 'vitest';
import { formatCents, formatCentsDelta, parseCents } from './format';
import { maskCep, maskCpfCnpj, maskCurrency, maskPhone, unmask } from './masks';

describe('dinheiro (inteiro em centavos, nunca float)', () => {
  it('formata centavos em BRL', () => {
    expect(formatCents(1990)).toBe('R$ 19,90');
    expect(formatCents(0)).toBe('R$ 0,00');
    expect(formatCents(10000)).toBe('R$ 100,00');
    expect(formatCents(8990)).toBe('R$ 89,90');
  });

  it('recusa float — é a regra não-negociável do projeto', () => {
    expect(() => formatCents(19.9)).toThrow(/inteiro em centavos/);
  });

  it('formata delta de modificador', () => {
    expect(formatCentsDelta(400)).toBe('+ R$ 4,00');
    expect(formatCentsDelta(-500)).toBe('− R$ 5,00');
    expect(formatCentsDelta(0)).toBe('Grátis');
  });

  it('converte o que o usuário digita em centavos', () => {
    expect(parseCents('19,90')).toBe(1990);
    expect(parseCents('R$ 19,90')).toBe(1990);
    expect(parseCents('')).toBe(0);
  });

  it('sobrevive à ida e volta sem perder centavo', () => {
    for (const cents of [1, 99, 100, 1990, 123456]) {
      expect(parseCents(formatCents(cents))).toBe(cents);
    }
  });
});

describe('máscaras brasileiras', () => {
  it('celular e fixo', () => {
    expect(maskPhone('11987654321')).toBe('(11) 98765-4321');
    expect(maskPhone('1134567890')).toBe('(11) 3456-7890');
  });

  it('CPF e CNPJ pelo tamanho', () => {
    expect(maskCpfCnpj('12345678900')).toBe('123.456.789-00');
    expect(maskCpfCnpj('12345678000190')).toBe('12.345.678/0001-90');
  });

  it('CEP', () => {
    expect(maskCep('01310100')).toBe('01310-100');
  });

  it('moeda digitada da direita para a esquerda', () => {
    expect(maskCurrency('1990')).toBe('R$ 19,90');
    expect(maskCurrency('5')).toBe('R$ 0,05');
  });

  it('desmascara para mandar à API', () => {
    expect(unmask('(11) 98765-4321')).toBe('11987654321');
  });
});
