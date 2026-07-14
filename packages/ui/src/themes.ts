/**
 * Os 4 templates de tema do storefront (docs/03-self-setup.md §5).
 *
 * O lojista escolhe 1 entre 4. NÃO existe seletor de cor livre — sem rampa em
 * runtime, sem validação de contraste dinâmica, sem "ajustamos seu tom".
 * Cada template é só um bloco de --brand-* aplicado sobre os tokens.
 *
 * Backoffice, KDS e apps operacionais são SEMPRE roxo Molho — o tema é uma
 * propriedade do storefront do tenant, não da plataforma.
 */

export type ThemeKey = 'roxo' | 'brasa' | 'folha' | 'grafite';

export interface Theme {
  key: ThemeKey;
  /** Nome exibido ao lojista no wizard. */
  name: string;
  /** Uma linha de "para quem é" — usada no card de escolha do tema. */
  personality: string;
  /** Cor da marca: botões, links, chips ativos. */
  brand: string;
  /** Tom escuro para TEXTO da marca sobre branco (AA). */
  brandStrong: string;
  /** Fundo de destaque, chip selecionado. */
  brandSubtle: string;
  /** Fundo de seção. */
  brandFaint: string;
  /** Realce secundário (badges, detalhes). */
  brandAccent: string;
  /** Cor do texto SOBRE a cor da marca. */
  onBrand: string;
}

export const THEMES: Record<ThemeKey, Theme> = {
  roxo: {
    key: 'roxo',
    name: 'Roxo',
    personality: 'Moderno, fintech, confiável. É o padrão — para quem não quer decidir.',
    brand: '#820AD1',
    brandStrong: '#6D0AAD',
    brandSubtle: '#EFE1FB',
    brandFaint: '#F8F1FE',
    brandAccent: '#B565F3',
    onBrand: '#FFFFFF',
  },
  brasa: {
    key: 'brasa',
    name: 'Brasa',
    personality: 'Apetitoso, quente, urgente. Hamburgueria, pizzaria, churrasco.',
    brand: '#D93025',
    brandStrong: '#A81E16',
    brandSubtle: '#FBE3E1',
    brandFaint: '#FEF5F4',
    brandAccent: '#F5A623',
    onBrand: '#FFFFFF',
  },
  folha: {
    key: 'folha',
    name: 'Folha',
    personality: 'Fresco, natural, saudável. Natural, açaí, sucos.',
    // ⚠️ Desvio consciente do doc: o hex publicado é #0F8A5F, mas branco sobre
    // ele dá 4.35:1 — reprova o AA de texto normal (4.5:1) que o §6.1 declara
    // bloqueante e que o §6.2 promete "por construção". Escurecido o mínimo para
    // passar (5.01:1); a diferença é imperceptível e o teste em themes.test.ts
    // guarda a regra. Revertível numa constante se a marca preferir o hex exato.
    brand: '#0D7F57',
    brandStrong: '#0A6244',
    brandSubtle: '#DCF2E8',
    brandFaint: '#F1FAF6',
    brandAccent: '#F5A623',
    onBrand: '#FFFFFF',
  },
  grafite: {
    key: 'grafite',
    name: 'Grafite',
    personality: 'Sofisticado, minimalista. Alta gastronomia, cafés, autoral.',
    brand: '#141216',
    brandStrong: '#141216',
    brandSubtle: '#EDECEF',
    brandFaint: '#F7F6F8',
    // O acento âmbar é a assinatura do Grafite (§5 do self-setup).
    brandAccent: '#F5A623',
    onBrand: '#FFFFFF',
  },
};

export const THEME_KEYS = Object.keys(THEMES) as ThemeKey[];

export const DEFAULT_THEME: ThemeKey = 'roxo';

export function getTheme(key: string | null | undefined): Theme {
  const theme = key ? THEMES[key as ThemeKey] : undefined;
  return theme ?? THEMES[DEFAULT_THEME];
}

/**
 * Converte o tema no bloco --brand-* que o storefront injeta no <html>.
 * É assim que o theme_json do tenant vira pixel — sem CSS por tenant, sem build.
 */
export function themeToCssVars(theme: Theme): Record<string, string> {
  return {
    '--brand': theme.brand,
    '--brand-strong': theme.brandStrong,
    '--brand-subtle': theme.brandSubtle,
    '--brand-faint': theme.brandFaint,
    '--brand-accent': theme.brandAccent,
    '--on-brand': theme.onBrand,
  };
}
