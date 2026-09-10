# Evidências Codex — fronts e release

**Branch:** `codex/no-go-front-release`
**Data:** 2026-09-10
**Ownership:** `NG-01–04`, `NG-09`, `NG-14–15`.

## R0 — decisões, acessos e contratos

| Item | Estado | Evidência |
|---|---|---|
| Slug, domínio, guest, pagamentos, backup, assets e dry run | confirmado pelo PM | `docs/go-live/ata-ng-01.md` |
| Acesso Vercel | confirmado | CLI autenticada no escopo `vinigehlens-projects` |
| BFF/API e domínios | congelado | doc 15 §4 + implementação allowlisted |
| Banco/impressão | aceito para integração | `docs/go-live/contratos-cc.md` |
| Jurídico e operador Cabanhas | pendente | ata NG-01 §4 |

`ZG-0` continua amarelo até jurídico e operador estarem nomeados/aceitos.

## R1 — NG-02 e frontend de NG-04

- Parser estrito de authority, hosts reservados, path mode só local, subdomínio e host
  técnico: `apps/storefront/lib/host-routing.ts`.
- Rewrite interno sem redirect e headers de request confiáveis: `apps/storefront/middleware.ts`.
- Canonical, OG, manifest, sitemap e robots absolutos no host público.
- Navegação do catálogo, carrinho, conta e tracking sem `/{slug}` em host mode.
- Site exige URLs HTTPS no build produtivo; backoffice exibe/copia
  `https://<slug>.molho.live`.
- Evidência automatizada final: 199 testes unitários da storefront e typecheck verdes.

Risco/dependência: a imutabilidade do slug na API é entrega C1; `NG-04` não fica verde
somente com esta metade frontend.

## R2 — NG-03

- Catch-all same-origin `/api/store/*` com allowlist explícita de métodos e paths.
- Admin, plataforma, traversal codificado, query não permitida, tenant cruzado e token
  indevido retornam erro sem atingir a API.
- Cookies e `Authorization` do browser não são propagados; o header dedicado de sessão do
  cliente só vira Bearer nas rotas permitidas.
- Body JSON limitado a 256 KiB, timeout de 8 s, redirects manuais e erro upstream uniforme.
- IP só vem de `x-vercel-forwarded-for` quando `VERCEL=1`.
- Playwright isolado: **3/3 verdes** — catálogo → carrinho → pickup → aceite legal → OTP →
  pedido → tracking + refresh; negativas admin/plataforma/tenant/payload; relatório CSP.

Handoff CC: validar a contagem de proxies Vercel → Fly antes do RC. O BFF envia um único
`X-Forwarded-For` confiável, mas `TRUSTED_PROXY_HOPS` da API precisa refletir a topologia
real para o rate limit continuar usando o IP do cliente.

## R3 — frontend de NG-08 e NG-09

- CSP em enforcement por padrão nos três fronts; report-only exige opt-in explícito.
- Origins exatas para API/assets/Sentry/PostHog/GA; sem `https:`, `ws:`, `wss:` genéricos.
- `unsafe-eval` somente em desenvolvimento; `object-src 'none'`,
  `frame-ancestors 'none'`, `base-uri` e headers defensivos.
- HSTS só liga depois de TLS validado; `includeSubDomains` exige uma segunda decisão.
- Coletor `/api/csp-report` limita 16 KiB e grava somente directive + origins, sem path,
  query ou sample.
- Sentry nos três fronts usa release por SHA e scrubber de e-mail, telefone, JWT, Bearer,
  cookies, tokens, endereço, body e URL sensível.
- Analytics da storefront redige token de tracking e não usa autocapture.

`NG-09` permanece amarelo até observação no staging/RC com origins finais e ativação de
HSTS após certificado válido.

## R4 — parte técnica de NG-14

- Projetos `molho-backoffice-prod` e `molho-storefront-prod` criados com roots corretos e
  Node 22.x.
- `molho-site` alinhado a Node 22.x.
- Nenhum deploy, domínio, DNS ou env parcial foi publicado.
- Inventário: `docs/go-live/inventario-fronts-producao.md`.
- Promoção/rollback: `docs/go-live/runbook-release-fronts.md`.

Bloqueios do RC: URL técnica da API (C5), origin de assets (C4), DSNs Sentry, revisão
jurídica e confirmação de e-mail. A varredura do primeiro build também encontrou
`api.staging.molho.live` no comando exibido por
`apps/backoffice/app/gestor/impressao/printer-settings.tsx`, arquivo reservado a C2; esse
handoff precisa remover a URL e o token de staff antes do RC. Portanto `NG-14` continua
vermelho.

## R5 — NG-15

Checklist operacional preparado em `docs/go-live/checklist-dry-run-cabanhas.md`. Nenhum
tenant foi publicado e `channel.storefront` não foi habilitado. O dry run físico e os
aceites continuam pendentes; `NG-15` permanece vermelho.

## Gate final da árvore candidata

Os gates abaixo foram executados depois do último ajuste de código da trilha Codex. O build
integral foi isolado porque havia servidores Next ativos no checkout principal.

| Comando | Resultado | Horário |
|---|---|---|
| `pnpm lint` | verde | 2026-09-10 |
| `pnpm test` | verde — Turbo 9/9; storefront 199, backoffice 249, API unit 737, contracts 404, UI 227, DB 35 e print-agent 19 | 2026-09-10 |
| `pnpm build` | verde — Turbo 7/7 em checkout isolado | 2026-09-10 |
| `pnpm --filter api test:e2e` | bloqueado pelo ambiente — Redis local recusou conexão; execução encerrada após 16 arquivos falhos por timeout, 2 passaram | 2026-09-10 |
| `pnpm --filter @molho/storefront test:e2e` | 3/3 verde em checkout isolado | 2026-09-09 |
| `pnpm verify:front-release` | vermelho no build integral — 2 artefatos compilados contêm URL de staging e o nome da credencial de staff originados no fluxo de impressão de ownership C2 | 2026-09-10 |

O gate global permanece vermelho. Para repetir o E2E da API é necessário disponibilizar o
Redis esperado pela suíte; para liberar a varredura, C2 deve remover
`api.staging.molho.live` de
`apps/backoffice/app/gestor/impressao/printer-settings.tsx` e reconstruir os fronts.
O verificador também exige `BUILD_ID` em cada `.next`, impedindo que uma saída parcial de
`next dev` seja aceita como build de release.
