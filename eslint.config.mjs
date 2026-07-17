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

  // ─── apps/api: PrismaClient direto é proibido fora do contexto de request ──
  // SET LOCAL app.tenant_id/app.is_platform só vale numa transação/conexão;
  // com pool, cada query pode pegar conexão física diferente. Todo acesso ao
  // banco em request path precisa passar pelo client transacional do
  // RequestContextService (ver CLAUDE.md § Contexto de request). Exceção:
  // context.module.ts (registra o provider do PrismaClient global — módulo
  // dedicado pra ser importável por quem precisa de RequestContextService
  // sem depender do AppModule inteiro) e o próprio request-context.service.ts.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: [
      'apps/api/src/context/context.module.ts',
      'apps/api/src/context/request-context.service.ts',
      // Testes legitimamente montam fakes tipados como PrismaClient/Prisma —
      // não é request path, é test double.
      'apps/api/src/**/*.test.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@molho/db',
              importNames: ['PrismaClient'],
              message:
                'Nunca importe PrismaClient direto aqui — todo acesso ao banco em request path passa pelo client transacional do RequestContextService (ver CLAUDE.md § Contexto de request). Use RequestContextService.getClient().',
            },
          ],
        },
      ],
    },
  },

  // ─── apps/api: consistent-type-imports conflita com o Nest ─────────────────
  // NestJS resolve DI implícita (constructor param sem @Inject) e faz
  // @Body()/@Param() virarem instância de DTO (ValidationPipe+class-
  // transformer) usando a referência de CLASSE de verdade, via reflexão
  // (design:paramtypes/emitDecoratorMetadata). `import type` apaga essa
  // referência em runtime — o auto-fix do consistent-type-imports quebrou
  // a injeção de RequestContextService e a validação de DTO na prática
  // (achado rodando os controllers de verdade, não só no lint). É um
  // conflito estrutural conhecido entre a regra e qualquer código NestJS
  // que dependa de reflexão, não específico destes dois arquivos — por
  // isso desligada pra `apps/api/src/**` inteiro, não só aqui.
  {
    files: ['apps/api/src/**/*.ts'],
    ignores: ['apps/api/src/**/*.test.ts'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'off',
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
