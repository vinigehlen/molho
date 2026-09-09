import type { PrintOutputConfig } from './config.js';
import { CommandPrinter, DryRunPrinter, type Printer } from './printer.js';
import { SystemPrinter } from './system-printer.js';

/**
 * - `MOLHO_PRINT_COMMAND` definido → `CommandPrinter` (escape hatch explícito).
 * - formato `escpos` sem comando → `SystemPrinter` (plug & play: spooler do SO,
 *   auto-detecção da impressora).
 * - formato `text` sem comando → `DryRunPrinter` (só stdout).
 */
export function makePrinter(config: PrintOutputConfig, log: (message: string) => void = console.log): Printer {
  if (config.printCommand) {
    return new CommandPrinter(config.printCommand, config.printArgs, config.printFormat, config.codepage);
  }
  if (config.printFormat === 'escpos') {
    return new SystemPrinter(config.printerName, config.codepage, (message) => log(`[impressora] ${message}`));
  }
  return new DryRunPrinter(
    config.printFormat,
    config.codepage,
    (message) => log(`[dry-run:${config.printFormat}]\n${message}`),
  );
}
