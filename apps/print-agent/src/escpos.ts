const ESC = 0x1b;
const GS = 0x1d;

/**
 * ESC/POS basico para comanda de cozinha.
 *
 * A comanda ja vem renderizada pela API; aqui so transformamos em bytes
 * imprimiveis por uma termica comum. Para evitar mojibake de codepage no
 * piloto, normalizamos para ASCII em vez de prometer acento perfeito em toda
 * Bematech/Elgin/Epson.
 */
export function renderEscPosTicket(ticketText: string, { cut }: { cut: boolean }): Buffer {
  const normalized = normalizeForThermal(ticketText);
  const chunks = [
    Buffer.from([ESC, 0x40]), // initialize
    Buffer.from([ESC, 0x61, 0x00]), // align left
    Buffer.from([ESC, 0x21, 0x00]), // normal text
    Buffer.from(`${normalized}\n\n\n`, 'ascii'),
  ];

  if (cut) {
    chunks.push(Buffer.from([GS, 0x56, 0x42, 0x00])); // partial cut
  }

  return Buffer.concat(chunks);
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
