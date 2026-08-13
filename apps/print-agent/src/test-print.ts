import { readOutputConfig } from './config.js';
import { makePrinter } from './printer-factory.js';
import { TEST_TICKET } from './test-ticket.js';

const config = readOutputConfig();
const printer = makePrinter(config);

console.log(`Molho print-agent teste: format=${config.printFormat}`);
if (!config.printCommand) {
  console.warn('MOLHO_PRINT_COMMAND ausente — teste em dry-run, nada sai na impressora fisica.');
}

await printer.print(TEST_TICKET, { cut: true });
console.log('Cupom de teste enviado.');
