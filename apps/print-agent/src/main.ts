import { PrintingApi } from './api.js';
import { readConfig } from './config.js';
import { runOnce } from './agent.js';
import { CommandPrinter, DryRunPrinter, type Printer } from './printer.js';

const config = readConfig();
const api = new PrintingApi(config);
const printer: Printer = config.printCommand
  ? new CommandPrinter(config.printCommand, config.printArgs, config.printFormat)
  : new DryRunPrinter(config.printFormat, (message) => console.log(`[dry-run:${config.printFormat}]\n${message}`));

let stopping = false;

process.once('SIGINT', () => {
  stopping = true;
});

process.once('SIGTERM', () => {
  stopping = true;
});

console.log(`Molho print-agent iniciado: tenant=${config.tenantId} worker=${config.workerId} format=${config.printFormat}`);
if (!config.printCommand) {
  console.warn('MOLHO_PRINT_COMMAND ausente — rodando em dry-run, nada sai na impressora fisica.');
}

while (!stopping) {
  try {
    await runOnce({ api, printer, logger: console });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    console.error(`erro no loop de impressao: ${message}`);
  }
  await new Promise((resolve) => setTimeout(resolve, config.pollMs));
}

console.log('Molho print-agent encerrado.');
