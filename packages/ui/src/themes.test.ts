import { describe, expect, it } from 'vitest';
import { AA_LARGE_TEXT, AA_NORMAL_TEXT, contrastRatio } from './lib/contrast';
import { DEFAULT_THEME, THEMES, THEME_KEYS, getTheme, themeToCssVars } from './themes';

const WHITE = '#FFFFFF';

describe('temas do storefront', () => {
  it('expõe exatamente os 4 templates decididos — nada de cor livre', () => {
    expect(THEME_KEYS).toEqual(['roxo', 'brasa', 'folha', 'grafite']);
  });

  it('usa Roxo como padrão', () => {
    expect(DEFAULT_THEME).toBe('roxo');
    expect(THEMES.roxo.brand).toBe('#820AD1');
  });

  it('cai no padrão quando o tenant não escolheu (ou escolheu lixo)', () => {
    expect(getTheme(null).key).toBe('roxo');
    expect(getTheme('tema-que-nao-existe').key).toBe('roxo');
    expect(getTheme('brasa').key).toBe('brasa');
  });

  it('vira um bloco --brand-* pronto para o <html> do tenant', () => {
    expect(themeToCssVars(THEMES.brasa)).toEqual({
      '--brand': '#D93025',
      '--brand-strong': '#A81E16',
      '--brand-subtle': '#FBE3E1',
      '--brand-faint': '#FEF5F4',
      '--brand-accent': '#F5A623',
      '--on-brand': '#FFFFFF',
    });
  });
});

// A promessa de marca é "todos AA por construção" (§6.2) e o §6.1 torna o
// contraste bloqueante. Aqui isso deixa de ser promessa: um template que
// reprove quebra o build antes de chegar em qualquer loja.
describe('acessibilidade dos 4 templates (AA por construção)', () => {
  it.each(THEME_KEYS)('%s: texto sobre a cor da marca passa AA', (key) => {
    const theme = THEMES[key];
    const ratio = contrastRatio(theme.onBrand, theme.brand);

    expect(
      ratio,
      `${key}: ${theme.onBrand} sobre ${theme.brand} = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(THEME_KEYS)('%s: texto da marca sobre branco passa AA', (key) => {
    const theme = THEMES[key];
    const ratio = contrastRatio(theme.brandStrong, WHITE);

    expect(
      ratio,
      `${key}: brandStrong ${theme.brandStrong} sobre branco = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(THEME_KEYS)('%s: texto da marca sobre o fundo sutil passa AA', (key) => {
    const theme = THEMES[key];
    const ratio = contrastRatio(theme.brandStrong, theme.brandSubtle);

    expect(
      ratio,
      `${key}: brandStrong sobre brandSubtle = ${ratio.toFixed(2)}:1`,
    ).toBeGreaterThanOrEqual(AA_NORMAL_TEXT);
  });

  it.each(THEME_KEYS)('%s: a cor da marca serve de borda/ícone sobre branco', (key) => {
    const theme = THEMES[key];
    const ratio = contrastRatio(theme.brand, WHITE);

    expect(ratio, `${key}: brand sobre branco = ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(
      AA_LARGE_TEXT,
    );
  });
});
