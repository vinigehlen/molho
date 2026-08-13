import type { PrintOutputConfig } from './config.js';
import { CommandPrinter, DryRunPrinter, type Printer } from './printer.js';

export function makePrinter(config: PrintOutputConfig, log: (message: string) => void = console.log): Printer {
  return config.printCommand
    ? new CommandPrinter(config.printCommand, config.printArgs, config.printFormat)
    : new DryRunPrinter(config.printFormat, (message) => log(`[dry-run:${config.printFormat}]\n${message}`));
}
