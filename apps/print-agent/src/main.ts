import { PrintingApi } from './api.js';
import { readConfig } from './config.js';
import { createAgentRunStats, recordAgentError, recordAgentResult, runOnce } from './agent.js';
import { makePrinter } from './printer-factory.js';

/** Revogado N vezes seguidas → sai com código 1 (o serviço mostra "parado"). */
const REVOKED_EXIT_THRESHOLD = 5;
/** Espera mínima após um 401/403 — não martela a API com credencial morta. */
const REVOKED_BACKOFF_MS = 30_000;

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
let consecutiveRevoked = 0;

console.log(
  `Molho print-agent iniciado: tenant=${config.tenantId ?? '(via token)'} worker=${config.workerId} format=${config.printFormat} codepage=${config.codepage} once=${config.once}`,
);
if (!config.printCommand && config.printFormat !== 'escpos') {
  console.warn('Formato "text" sem MOLHO_PRINT_COMMAND — dry-run, nada sai na impressora. Use MOLHO_PRINT_FORMAT=escpos.');
}

while (!stopping) {
  let sleepMs = config.pollMs;
  try {
    const result = await runOnce({ api, printer, logger: console });
    stats = recordAgentResult(stats, result);
    ticks += 1;

    if (result === 'revoked') {
      consecutiveRevoked += 1;
      if (consecutiveRevoked >= REVOKED_EXIT_THRESHOLD) {
        console.error(`credencial rejeitada ${consecutiveRevoked}x seguidas — encerrando. Pareie o dispositivo de novo.`);
        process.exitCode = 1;
        break;
      }
      sleepMs = Math.max(config.pollMs, REVOKED_BACKOFF_MS);
    } else {
      consecutiveRevoked = 0;
    }

    if (config.once) break;
    if (config.healthEvery > 0 && ticks % config.healthEvery === 0) {
      console.log(
        `health: printed=${stats.printed} failed=${stats.failed} stale=${stats.stale} revoked=${stats.revoked} idle=${stats.idle} last=${stats.lastResult ?? 'none'}`,
      );
    }
  } catch (error) {
    stats = recordAgentError(stats, error);
    console.error(`erro no loop de impressao: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    if (config.once) {
      process.exitCode = 1;
      break;
    }
  }
  if (config.once) break;
  await new Promise((resolve) => setTimeout(resolve, sleepMs));
}

console.log(
  `Molho print-agent encerrado: printed=${stats.printed} failed=${stats.failed} stale=${stats.stale} revoked=${stats.revoked} idle=${stats.idle}`,
);
