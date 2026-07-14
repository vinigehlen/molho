import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

/**
 * ESLint flat config único do monorepo.
 * A regra do hex (ver bloco `apps/**` abaixo) é requisito do design system:
 * doc de marca §4 — "hex hardcoded em apps/* = erro de CI".
 */
export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/.turbo/**',
      '**/dist/**',
      '**/build/**',
      '**/coverage/**',
      '**/storybook-static/**',
      '**/*.config.js',
      '**/*.config.mjs',
      // Gerado pelo Next a cada build; o próprio arquivo diz "não edite" e
      // exige triple-slash reference — conflita com @typescript-eslint por
      // convenção do Next, não por erro nosso.
      '**/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': [
        'error',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  // ─── Design system: cor só via token semântico ───────────────────────────────
  // Componentes nunca usam hex direto. A paleta vive em packages/ui (tokens.css
  // e themes.ts) — que por isso está fora desta regra.
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]',
          message:
            'Cor hex hardcoded é proibida em apps/. Use um token semântico do Tempero (ex.: bg-brand, text-muted) — ver docs/04-brand-design-system.md §4.',
        },
        {
          selector: 'TemplateElement[value.raw=/#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})\\b/]',
          message:
            'Cor hex hardcoded é proibida em apps/. Use um token semântico do Tempero (ex.: bg-brand, text-muted) — ver docs/04-brand-design-system.md §4.',
        },
      ],
    },
  },

  // Scripts .mjs rodam no Node (servidor estático do teste de contraste).
  {
    files: ['**/*.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },

  // Testes e stories podem usar mocks/valores literais à vontade.
  {
    files: ['**/*.test.{ts,tsx}', '**/*.stories.{ts,tsx}', '**/vitest.setup.ts'],
    rules: {
      'no-restricted-syntax': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },

  prettier,
);
