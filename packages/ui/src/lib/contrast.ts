/**
 * Contraste WCAG 2.1 — usado pelo validador de temas.
 *
 * Existe porque acessibilidade AA é regra bloqueante (doc de marca §6.1) e os 4
 * templates prometem ser "AA por construção" (§6.2). Aqui isso vira teste, não
 * promessa: themes.test.ts falha o build se um template violar o contraste.
 */

/** Contraste mínimo para texto normal (< 24px, ou < 18.66px bold). */
export const AA_NORMAL_TEXT = 4.5;
/** Contraste mínimo para texto grande e componentes de UI (bordas, ícones). */
export const AA_LARGE_TEXT = 3;

/** #RGB | #RRGGBB → [r, g, b] em 0–255. */
export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '').trim();

  const full =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;

  if (!/^[0-9a-fA-F]{6}$/.test(full)) {
    throw new Error(`Hex inválido: "${hex}"`);
  }

  return [
    parseInt(full.slice(0, 2), 16),
    parseInt(full.slice(2, 4), 16),
    parseInt(full.slice(4, 6), 16),
  ];
}

/** Luminância relativa (WCAG 2.1). */
export function relativeLuminance(hex: string): number {
  const channels = hexToRgb(hex).map((value) => {
    const c = value / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  }) as [number, number, number];

  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

/** Razão de contraste entre duas cores, de 1 (nenhum) a 21 (preto/branco). */
export function contrastRatio(foreground: string, background: string): number {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const lighter = Math.max(a, b);
  const darker = Math.min(a, b);

  return (lighter + 0.05) / (darker + 0.05);
}

export function meetsAA(foreground: string, background: string, largeText = false): boolean {
  const min = largeText ? AA_LARGE_TEXT : AA_NORMAL_TEXT;
  return contrastRatio(foreground, background) >= min;
}
