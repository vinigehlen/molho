import { describe, expect, it, vi } from 'vitest';
import { makePrinter } from './printer-factory.js';
import { CommandPrinter, DryRunPrinter } from './printer.js';

describe('makePrinter', () => {
  it('sem comando cria dry-run', () => {
    expect(makePrinter({ printCommand: null, printArgs: [], printFormat: 'text' }, vi.fn())).toBeInstanceOf(DryRunPrinter);
  });

  it('com comando cria CommandPrinter', () => {
    expect(makePrinter({ printCommand: 'lp', printArgs: ['-d', 'Cozinha'], printFormat: 'escpos' })).toBeInstanceOf(
      CommandPrinter,
    );
  });
});
