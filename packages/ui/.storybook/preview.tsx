import type { Decorator, Preview } from '@storybook/react-vite';
import React from 'react';
import { THEMES, type ThemeKey, themeToCssVars } from '../src/themes';
import '../src/tokens.css';
import './preview.css';

/**
 * Aplica o tema no <html>, e não num wrapper.
 *
 * É o mesmo mecanismo da produção (o storefront injeta o bloco --brand-* no
 * elemento raiz do tenant) e resolve um problema real: conteúdo em portal —
 * MoSheet, toasts — vive fora da árvore do Storybook. Preso a um wrapper, o
 * sheet renderizaria sempre no tema roxo e escaparia do portão de contraste.
 */
const withTheme: Decorator = (Story, context) => {
  const key = (context.globals.theme as ThemeKey) ?? 'roxo';

  React.useLayoutEffect(() => {
    const raiz = document.documentElement;
    const vars = themeToCssVars(THEMES[key]);

    for (const [prop, valor] of Object.entries(vars)) {
      raiz.style.setProperty(prop, valor);
    }
  }, [key]);

  return (
    <div className="bg-bg text-text font-sans p-6">
      <Story />
    </div>
  );
};

const preview: Preview = {
  decorators: [withTheme],
  globalTypes: {
    theme: {
      description: 'Template de tema do storefront (o lojista escolhe 1 dos 4)',
      defaultValue: 'roxo',
      toolbar: {
        title: 'Tema',
        icon: 'paintbrush',
        items: Object.values(THEMES).map((theme) => ({
          value: theme.key,
          title: theme.name,
        })),
        dynamicTitle: true,
      },
    },
  },
  parameters: {
    layout: 'centered',
    a11y: { test: 'error' },
    controls: { expanded: true },
  },
};

export default preview;
