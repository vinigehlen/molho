# Contexto Para Agentes

Este arquivo e o `AGENTS.md` são o ponto de entrada para qualquer agente trabalhando no Molho. O objetivo é separar a fonte oficial do produto dos artefatos temporários gerados durante exploração, revisão visual e deploy.

## O Que É O Molho

Molho é uma plataforma SaaS multi-tenant para restaurantes brasileiros venderem por cardápio digital, delivery próprio e operação de pedidos. O MVP prioriza restaurantes que hoje recebem pedidos manualmente pelo WhatsApp e precisam de um fluxo simples, mobile-first e com mensalidade fixa.

## Fonte Oficial

Leia nesta ordem:

1. `AGENTS.md` - regras operacionais do repositório, arquitetura, invariantes e decisões não-negociáveis.
2. `docs/01-plano-produto.md` - arquitetura de produto, módulos, RBAC, roadmap e épicos.
3. `docs/02-definicoes-v1.md` - ICP, escopo do MVP, planos e regras de pedido.
4. `docs/03-self-setup.md` - onboarding, temas e billing.
5. `docs/04-brand-design-system.md` - marca, design system Tempero e tom de voz.
6. `docs/07-aprendizados.md` - armadilhas de tooling, migrations, build e testes.

Documentos de handoff e auditoria em `docs/09b-*`, `docs/10/`, `docs/99-*` e `docs/handoff-*` são histórico útil, mas não substituem os documentos acima quando houver divergência.

## Apps E Pacotes

- `apps/site` - site institucional de produção em `https://molho.live`.
- `apps/storefront` - cardápio white-label por tenant.
- `apps/backoffice` - gestor do lojista.
- `apps/api` - API NestJS de vida longa.
- `apps/print-agent` - agente local de impressão.
- `packages/contracts` - contratos compartilhados, permissões, schemas e tipos.
- `packages/db` - Prisma, migrations, RLS, seed e helpers de banco.
- `packages/ui` - design system e componentes compartilhados.

## Ambientes Conhecidos

- Site: `https://molho.live`, projeto Vercel `molho-site`, root directory `apps/site`.
- Storefront staging: `https://staging.molho.live`, projeto Vercel `molho`, root directory `apps/storefront`.
- Backoffice staging: `https://staging-app.molho.live`, projeto Vercel `molho-backoffice-staging`, root directory `apps/backoffice`.
- API staging: `https://api.staging.molho.live`.

Não versionar tokens, `.env.local`, `.vercel/`, dumps, cookies ou qualquer credencial. O `.env.example` documenta nomes e formatos sem segredo.

## Comandos De Validação

Use a raiz do monorepo:

```bash
pnpm lint
pnpm test
pnpm build
```

E2E é separado:

```bash
pnpm --filter @molho/api test:e2e
```

Para o site:

```bash
pnpm --filter @molho/site build
curl https://molho.live
curl https://molho.live/sitemap.xml
```

## O Que Não Vai Para O GitHub

- `.env*`, exceto `.env.example`.
- `.vercel/`.
- `.codex/`.
- `.impeccable/` e screenshots de review.
- `artifacts/`, salvo quando um arquivo for promovido manualmente para `docs/` como decisão oficial.
- Caches, builds, coverage, relatórios de teste e arquivos temporários.

## Estado Da Publicação Do Site

O site institucional foi publicado no projeto Vercel `molho-site`, com `molho.live` e `www.molho.live` anexados e verificados. O sitemap público esperado é `https://molho.live/sitemap.xml`.
