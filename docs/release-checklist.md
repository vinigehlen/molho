# Checklist De Release

Use este checklist antes de publicar uma branch ou pedir revisão.

## Higiene Do Repo

- `git status --short` revisado.
- Nada de `.env.local`, `.vercel/`, cookies, tokens, dumps ou logs.
- Artefatos locais ficam fora do commit: `.codex/`, `.impeccable/`, `artifacts/`.
- Docs novos estão em `docs/` com nome claro.
- Decisões de produto conflitantes foram consolidadas em `docs/01-*` a `docs/04-*` ou referenciadas por handoff.

## Validação Técnica

```bash
pnpm lint
pnpm test
pnpm build
```

Quando mexer em auth/checkout/pedidos, rode também os e2e relevantes:

```bash
pnpm --filter @molho/api test:e2e
```

## Site Público

```bash
pnpm --filter @molho/site build
curl https://molho.live
curl https://molho.live/sitemap.xml
```

## Commits Recomendados

1. Documentação e contexto de agentes.
2. Código de produto por área (`site`, `storefront`, `backoffice`, `api`).
3. Ajustes compartilhados em `packages/*`.
4. Limpeza de artefatos e ignores.
