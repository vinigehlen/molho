import { describe, expect, it } from 'vitest';
import { normalizeForThermal, renderEscPosTicket } from './escpos.js';

describe('normalizeForThermal', () => {
  it('remove acentos e troca simbolos comuns por ASCII', () => {
    expect(normalizeForThermal('PEDIDO #AB12\n2× X-Búrguer — sem cebola')).toBe('PEDIDO #AB12\n2x X-Burguer - sem cebola');
  });
});

describe('renderEscPosTicket', () => {
  it('ascii (default): init ESC/POS, texto sem acento e corte quando pedido', () => {
    const bytes = renderEscPosTicket('Olá cozinha', { cut: true });

    expect([...bytes.subarray(0, 8)]).toEqual([0x1b, 0x40, 0x1b, 0x61, 0x00, 0x1b, 0x21, 0x00]);
    expect(bytes.toString('ascii')).toContain('Ola cozinha');
    expect([...bytes.subarray(-4)]).toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('omite corte quando cut=false', () => {
    const bytes = renderEscPosTicket('Pedido', { cut: false });
    expect([...bytes.subarray(-4)]).not.toEqual([0x1d, 0x56, 0x42, 0x00]);
  });

  it('cp850: seleciona a página (ESC t 2) e mantém o acento nos bytes', () => {
    const bytes = renderEscPosTicket('Açaí', { cut: false, codepage: 'cp850' });
    expect([...bytes.subarray(0, 8)]).toEqual([0x1b, 0x40, 0x1b, 0x61, 0x00, 0x1b, 0x21, 0x00]);
    expect([...bytes.subarray(8, 11)]).toEqual([0x1b, 0x74, 0x02]); // ESC t 2
    expect(bytes).toContain(0x87); // ç em cp850
    expect(bytes).toContain(0xa1); // í em cp850
  });
});
