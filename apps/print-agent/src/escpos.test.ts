import { describe, expect, it } from 'vitest';
import { normalizeForThermal, renderEscPosTicket } from './escpos.js';

describe('normalizeForThermal', () => {
  it('remove acentos e troca simbolos comuns por ASCII', () => {
    expect(normalizeForThermal('PEDIDO #AB12\n2× X-Búrguer — sem cebola')).toBe('PEDIDO #AB12\n2x X-Burguer - sem cebola');
  });
});

describe('renderEscPosTicket', () => {
  it('gera init ESC/POS, texto ASCII e corte quando pedido', () => {
    const bytes = renderEscPosTicket('Olá cozinha', { cut: true });

    expect([...bytes.subarray(0, 8)]).toEqual([0x1b, 0x40, 0x1b, 0x61, 0x00, 0x1b, 0x21, 0x00]);
    expect(bytes.toString('ascii')).toContain('Ola cozinha');
    expect([...bytes.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('omite corte quando cut=false', () => {
    const bytes = renderEscPosTicket('Pedido', { cut: false });

    expect([...bytes.subarray(-4)]).not.toEqual([0x1d, 0x56, 0x42, 0x00]);
  });
});
