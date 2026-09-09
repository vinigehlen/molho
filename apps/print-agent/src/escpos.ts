import { type Codepage, ESC_T_SELECTOR, encodeCodepage } from './codepage.js';

const ESC = 0x1b;
const GS = 0x1d;

export interface RenderOptions {
  cut: boolean;
  /** Página de código da impressora. Default `ascii` (comportamento antigo). */
  codepage?: Codepage;
}

/**
 * ESC/POS para comanda de cozinha. A comanda já vem renderizada pela API; aqui
 * vira bytes.
 *
 * `codepage`:
 * - `ascii` (default): normaliza acento pra ASCII — funciona em qualquer
 *   térmica sem configurar página.
 * - `cp850`/`cp860`: seleciona a página na impressora (`ESC t n`) e encoda o
 *   texto nela — acento de verdade. i7/Elgin/Bematech aceitam as duas; `cp850`
 *   é o default mais comum. Ver codepage.ts.
 */
export function renderEscPosTicket(ticketText: string, { cut, codepage = 'ascii' }: RenderOptions): Buffer {
  const chunks: Buffer[] = [
    Buffer.from([ESC, 0x40]), // initialize
    Buffer.from([ESC, 0x61, 0x00]), // align left
    Buffer.from([ESC, 0x21, 0x00]), // normal text
  ];

  if (codepage === 'ascii') {
    chunks.push(Buffer.from(`${normalizeForThermal(ticketText)}\n\n\n`, 'ascii'));
  } else {
    chunks.push(Buffer.from([ESC, 0x74, ESC_T_SELECTOR[codepage]])); // select code page
    chunks.push(encodeCodepage(`${stripControl(ticketText)}\n\n\n`, codepage));
  }

  if (cut) {
    chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00])); // partial cut
  }

  return Buffer.concat(chunks);
}

/** Só remove caracteres de controle — mantém acento (a página cuida dele). */
function stripControl(input: string): string {
  return [...input].filter((char) => {
    const code = char.charCodeAt(0);
    return code === 9 || code === 10 || code === 13 || code >= 32;
  }).join('');
}

export function normalizeForThermal(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[×]/g, 'x')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replaceAll(/./gs, (char) => (isPrintableAscii(char) ? char : '?'));
}

function isPrintableAscii(char: string): boolean {
  const code = char.charCodeAt(0);
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
}
