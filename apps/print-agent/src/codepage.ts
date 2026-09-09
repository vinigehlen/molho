/**
 * Codepages de térmica brasileira. A i7 (e a maioria das Elgin/Bematech) aceita
 * CP850 e CP860 — imprime acento de verdade em vez de "Guarana". Selecionadas
 * na impressora com `ESC t n`; o texto tem que ser encodado na mesma página.
 *
 * Tabela só da metade alta (0x80–0xFF) que interessa pro português. Char fora
 * da tabela cai pro ASCII sem acento (mesma normalização do modo `ascii`).
 */

export type Codepage = 'cp850' | 'cp860' | 'ascii';

/** Argumento de `ESC t n`. */
export const ESC_T_SELECTOR: Record<Exclude<Codepage, 'ascii'>, number> = {
  cp850: 2,
  cp860: 3,
};

/** char Unicode → byte na página. */
const CP850: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ä: 0x84, à: 0x85, å: 0x86, ç: 0x87,
  ê: 0x88, ë: 0x89, è: 0x8a, ï: 0x8b, î: 0x8c, ì: 0x8d, Ä: 0x8e, Å: 0x8f,
  É: 0x90, ô: 0x93, ö: 0x94, ò: 0x95, û: 0x96, ù: 0x97, ÿ: 0x98, Ö: 0x99,
  Ü: 0x9a, ø: 0x9b, '×': 0x9e, á: 0xa0, í: 0xa1, ó: 0xa2, ú: 0xa3, ñ: 0xa4,
  Ñ: 0xa5, ª: 0xa6, º: 0xa7, '¿': 0xa8, Á: 0xb5, Â: 0xb6, À: 0xb7, ã: 0xc6,
  Ã: 0xc7, ð: 0xd0, Ð: 0xd1, Ê: 0xd2, Ë: 0xd3, È: 0xd4, Í: 0xd6, Î: 0xd7,
  Ï: 0xd8, Ì: 0xde, Ó: 0xe0, ß: 0xe1, Ô: 0xe2, Ò: 0xe3, õ: 0xe4, Õ: 0xe5,
  µ: 0xe6, Ú: 0xe9, Û: 0xea, Ù: 0xeb, ý: 0xec, Ý: 0xed, '±': 0xf1, '°': 0xf8,
  '·': 0xfa,
};

/** CP860 (Portugal/Brasil) — difere da 850 principalmente nos til/circunflexo. */
const CP860: Record<string, number> = {
  Ç: 0x80, ü: 0x81, é: 0x82, â: 0x83, ã: 0x84, à: 0x85, Á: 0x86, ç: 0x87,
  ê: 0x88, Ê: 0x89, è: 0x8a, Í: 0x8b, Ô: 0x8c, ì: 0x8d, Ã: 0x8e, Â: 0x8f,
  É: 0x90, À: 0x91, È: 0x92, ô: 0x93, õ: 0x94, ò: 0x95, Ú: 0x96, ù: 0x97,
  Ì: 0x98, Õ: 0x99, Ü: 0x9a, '¢': 0x9b, Ó: 0x9f, á: 0xa0, í: 0xa1, ó: 0xa2,
  ú: 0xa3, ñ: 0xa4, Ñ: 0xa5, ª: 0xa6, º: 0xa7, '¿': 0xa8, Ò: 0xa9, '±': 0xf1,
  '°': 0xf8,
};

const TABLES: Record<Exclude<Codepage, 'ascii'>, Record<string, number>> = {
  cp850: CP850,
  cp860: CP860,
};

/** Acento → sem acento, pra char que não está na tabela da página. */
function stripAccent(char: string): string {
  return char
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[–—]/g, '-')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/[×]/g, 'x');
}

function isPrintableAscii(code: number): boolean {
  return code === 9 || code === 10 || code === 13 || (code >= 32 && code <= 126);
}

/**
 * Encoda para a página escolhida. Char na tabela → byte da página; senão →
 * ASCII sem acento; senão → '?'. Nunca lança.
 */
export function encodeCodepage(text: string, codepage: Exclude<Codepage, 'ascii'>): Buffer {
  const table = TABLES[codepage];
  const bytes: number[] = [];
  for (const char of text) {
    const mapped = table[char];
    if (mapped !== undefined) {
      bytes.push(mapped);
      continue;
    }
    const code = char.charCodeAt(0);
    if (isPrintableAscii(code)) {
      bytes.push(code);
      continue;
    }
    for (const fallbackChar of stripAccent(char)) {
      const fc = fallbackChar.charCodeAt(0);
      bytes.push(isPrintableAscii(fc) ? fc : 0x3f); // '?'
    }
  }
  return Buffer.from(bytes);
}

export function parseCodepage(raw: string | undefined): Codepage {
  if (!raw) return 'cp850';
  if (raw === 'cp850' || raw === 'cp860' || raw === 'ascii') return raw;
  throw new Error('MOLHO_PRINT_CODEPAGE precisa ser "cp850", "cp860" ou "ascii".');
}
