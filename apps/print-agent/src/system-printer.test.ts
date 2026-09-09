import { describe, expect, it } from 'vitest';
import { selectPrinterName } from './system-printer.js';

describe('selectPrinterName', () => {
  it('prioriza o nome configurado', () => {
    expect(selectPrinterName(['A', 'B'], 'Escolhida')).toBe('Escolhida');
  });

  it('casa impressora térmica conhecida', () => {
    expect(selectPrinterName(['Microsoft Print to PDF', 'ELGIN I7', 'OneNote'], null)).toBe('ELGIN I7');
    expect(selectPrinterName(['HP LaserJet', 'Generic / Text Only'], null)).toBe('Generic / Text Only');
  });

  it('sem match cai na primeira da lista; lista vazia → null', () => {
    expect(selectPrinterName(['HP LaserJet', 'Brother'], null)).toBe('HP LaserJet');
    expect(selectPrinterName([], null)).toBeNull();
  });
});
