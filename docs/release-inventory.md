# Inventario De Publicacao

Data: 2026-08-24

Este inventario registra o que deve ir para o GitHub para que agentes e humanos consigam operar a ultima versao do Molho sem depender de contexto de conversa.

## Publicar Como Fonte Oficial

- `AGENTS.md` - regras operacionais, arquitetura, stack e invariantes.
- `README.md` - indice publico do monorepo.
- `docs/00-contexto-agentes.md` - mapa rapido de contexto para agentes.
- `docs/deploy-site.md` - deploy/DNS do site institucional.
- `docs/release-checklist.md` - checklist antes de branch, PR e release.
- `docs/release-inventory.md` - este inventario.
- `docs/11-benchmark-concorrentes.md` - benchmark competitivo usado como insumo de produto.
- `docs/13-onboarding-self-setup-benchmark.md` - plano e aceite do self-setup.
- `docs/handoff-features-conversao-gestor.md` - handoff historico das features de conversao/gestor.

## Publicar Como Codigo De Produto

- `apps/site` - SEO, sitemap, robots, 404, loading/error states, paginas legais, cookie banner, analytics com consentimento, favicon/OG.
- `apps/storefront` - sitemap/robots/404/loading/error e melhorias de imagens/acessibilidade.
- `apps/backoffice` - loading/error/not-found, favicon, configuracao/onboarding, analytics, balcao, ajustes de auth/sessao e APIs auxiliares.
- `apps/api` - modulos de analytics, store setup, pedidos de balcao, imagens de produto e wiring no app module.
- `packages/contracts` - schemas compartilhados para analytics, catalog admin, store setup, pedido/admin/balcao e permissoes.
- `packages/db/prisma/migrations/20260822120000_analytics_orders_index` - migration nova relacionada a analytics de pedidos.
- `packages/ui` - ajustes nos componentes de produto usados por storefront/backoffice.
- `pnpm-lock.yaml` - atualizar junto quando dependencias ou grafo de workspace mudarem.

## Manter Fora Do GitHub

- `.env*`, exceto `.env.example`.
- `.vercel/` em qualquer app.
- `.codex/` e screenshots de validacao local.
- `.impeccable/`, `.impeccable-review-*.png`.
- `.github/agents/`, `.github/hooks/`, `.github/skills/` gerados por plugin local.
- `artifacts/` com opcoes antigas de landing page e documentos exportados.
- Builds e caches: `.next/`, `.turbo/`, `dist/`, `coverage/`, `playwright-report/`, `test-results/`.

## Revisar Antes De Merge

- Mudancas em `apps/api/src/orders/*`, `packages/contracts/src/*` e migrations mexem em pedidos, dinheiro, permissoes ou contratos: revisar com cuidado antes de merge em `main`.
- `apps/backoffice/lib/staff-auth.ts` e `staff-session.ts` tocam sessao/token: validar fluxo de login, refresh e logout.
- `apps/site` ja foi publicado em Vercel, mas deve ser commitado para o GitHub virar fonte da verdade.

## Commits Sugeridos

1. `organiza contexto e checklist de release`
2. `publica SEO e paginas legais do site`
3. `publica estados globais do storefront e backoffice`
4. `publica analytics e self-setup do gestor`
5. `publica pedidos de balcao e contratos compartilhados`
