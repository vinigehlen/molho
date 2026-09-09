import { describe, expect, it, vi } from 'vitest';
import type { PrintOutputConfig } from './config.js';
import { makePrinter } from './printer-factory.js';
import { CommandPrinter, DryRunPrinter } from './printer.js';
import { SystemPrinter } from './system-printer.js';

function output(over: Partial<PrintOutputConfig> = {}): PrintOutputConfig {
  return { printCommand: null, printArgs: [], printFormat: 'text', printerName: null, codepage: 'cp850', ...over };
}

describe('makePrinter', () => {
  it('formato text sem comando → dry-run', () => {
    expect(makePrinter(output(), vi.fn())).toBeInstanceOf(DryRunPrinter);
  });

  it('formato escpos sem comando → SystemPrinter (plug & play)', () => {
    expect(makePrinter(output({ printFormat: 'escpos' }), vi.fn())).toBeInstanceOf(SystemPrinter);
  });

  it('comando explícito → CommandPrinter mesmo em escpos', () => {
    expect(
      makePrinter(output({ printCommand: 'lp', printArgs: ['-d', 'Cozinha'], printFormat: 'escpos' })),
    ).toBeInstanceOf(CommandPrinter);
  });
});
