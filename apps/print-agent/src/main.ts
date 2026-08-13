import { PrintingApi } from './api.js';
import { readConfig } from './config.js';
import { createAgentRunStats, recordAgentError, recordAgentResult, runOnce } from './agent.js';
import { makePrinter } from './printer-factory.js';

const config = readConfig();
const api = new PrintingApi(config);
const printer = makePrinter(config);

let stopping = false;

process.once('SIGINT', () => {
  stopping = true;
});

process.once('SIGTERM', () => {
  stopping = true;
});

let stats = createAgentRunStats();
let ticks = 0;

console.log(
  `Molho print-agent iniciado: tenant=${config.tenantId} worker=${config.workerId} format=${config.printFormat} once=${config.once}`,
);
if (!config.printCommand) {
  console.warn('MOLHO_PRINT_COMMAND ausente — rodando em dry-run, nada sai na impressora fisica.');
}

while (!stopping) {
  try {
    const result = await runOnce({ api, printer, logger: console });
    stats = recordAgentResult(stats, result);
    ticks += 1;
    if (config.once) break;
    if (config.healthEvery > 0 && ticks % config.healthEvery === 0) {
      console.log(
        `health: printed=${stats.printed} failed=${stats.failed} stale=${stats.stale} idle=${stats.idle} last=${stats.lastResult ?? 'none'}`,
      );
    }
  } catch (error) {
    stats = recordAgentError(stats, error);
    const message = error instanceof Error ? error.message : 'erro desconhecido';
    console.error(`erro no loop de impressao: ${message}`);
    if (config.once) process.exitCode = 1;
  }
  if (config.once) break;
  await new Promise((resolve) => setTimeout(resolve, config.pollMs));
}

console.log(
  `Molho print-agent encerrado: printed=${stats.printed} failed=${stats.failed} stale=${stats.stale} idle=${stats.idle}`,
);
