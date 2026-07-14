import type { Decorator, Preview } from '@storybook/react-vite';
import React from 'react';
import { THEMES, type ThemeKey, themeToCssVars } from '../src/themes';
import '../src/tokens.css';
import './preview.css';

/**
 * Troca o tema do storefront ao vivo — é o mesmo mecanismo que o tenant usa em
 * produção: injetar o bloco --brand-* no elemento raiz. Nenhum CSS por tema.
 */
const withTheme: Decorator = (Story, context) => {
  const key = (context.globals.theme as ThemeKey) ?? 'roxo';
  const vars = themeToCssVars(THEMES[key]) as React.CSSProperties;

  return (
    <div style={vars} className="bg-bg text-text font-sans p-6">
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
