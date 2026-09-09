import { describe, expect, it } from 'vitest';
import { encodeCodepage, parseCodepage } from './codepage.js';

describe('encodeCodepage cp850', () => {
  it('mapeia acento português pros bytes da página', () => {
    const bytes = encodeCodepage('Guaraná Açaí', 'cp850');
    expect([...bytes]).toEqual([
      0x47, 0x75, 0x61, 0x72, 0x61, 0x6e, 0xa0, // Guaraná (á = 0xA0)
      0x20,
      0x41, 0x87, 0x61, 0xa1, // Açaí (ç = 0x87, í = 0xA1)
    ]);
  });

  it('caractere fora da tabela vira ASCII sem acento', () => {
    // 'Ł' não está na tabela → NFD não decompõe → '?'
    expect([...encodeCodepage('caça—x', 'cp850')]).toEqual([0x63, 0x61, 0x87, 0x61, 0x2d, 0x78]);
  });

  it('cp860 usa bytes diferentes pro til', () => {
    expect(encodeCodepage('ã', 'cp850')[0]).toBe(0xc6);
    expect(encodeCodepage('ã', 'cp860')[0]).toBe(0x84);
  });
});

describe('parseCodepage', () => {
  it('default cp850, aceita os três, rejeita o resto', () => {
    expect(parseCodepage(undefined)).toBe('cp850');
    expect(parseCodepage('cp860')).toBe('cp860');
    expect(parseCodepage('ascii')).toBe('ascii');
    expect(() => parseCodepage('latin1')).toThrow();
  });
});
