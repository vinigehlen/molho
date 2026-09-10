# Evidências Codex — fronts e release

**Branch:** `codex/no-go-front-release`
**Data:** 2026-09-10
**Ownership:** `NG-01–04`, `NG-09`, `NG-14–15`.

## Integração Git

- `main@efbc266` foi integrada por rebase, preservando as entregas C1/C2 e os ajustes de
  impressão do CC.
- A implementação candidata no momento do gate ficou representada por `6961bc1`
  (fronts) e `e0ac726` (documentação), sem commits pendentes da `main`.
- Os únicos conflitos ocorreram nos documentos `14` e `15`; a resolução consolidou as
  decisões da `main` com o handoff Codex. Nenhum arquivo exclusivo de API, Prisma,
  contratos ou agente foi sobrescrito.

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
- Somente os envs da API técnica foram gravados; nenhum deploy, domínio ou DNS foi
  publicado.
- Inventário: `docs/go-live/inventario-fronts-producao.md`.
- Promoção/rollback: `docs/go-live/runbook-release-fronts.md`.

Auditoria e configuração direta da Vercel em 10/09/2026:

- `molho-storefront-prod`: `MOLHO_API_INTERNAL_URL=https://molho-api.fly.dev` foi gravada
  no ambiente Production; demais variáveis pendentes;
- `molho-backoffice-prod`: `NEXT_PUBLIC_API_URL=https://molho-api.fly.dev` foi gravada no
  ambiente Production; demais variáveis pendentes;
- `molho-site`: somente `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_APP_URL` em Production.

Validação da API técnica em 10/09/2026:

- `GET https://molho-api.fly.dev/ready`: HTTP 200, `db=ok`, `redis=ok`;
- `fly status -a molho-api`: duas máquinas `started` em `gru`, ambas com 2/2 checks
  passando.

O certificado de `api.molho.live` foi criado e permanece `Not verified`, como esperado,
até o apontamento de DNS autorizado somente depois de `ZG-5`.

Bloqueios do RC: origin de assets (C4), DSNs Sentry, revisão jurídica e confirmação de
e-mail. A varredura do build integrado encontrou
`api.staging.molho.live` no comando exibido por
`apps/backoffice/app/gestor/impressao/printer-settings.tsx`, arquivo reservado a C2. A
credencial legada de staff já não aparece no artefato integrado. Portanto `NG-14`
continua vermelho e nenhum RC de produção foi criado.

## R5 — NG-15

Checklist operacional preparado em `docs/go-live/checklist-dry-run-cabanhas.md`. Nenhum
tenant foi publicado e `channel.storefront` não foi habilitado. O dry run físico e os
aceites continuam pendentes; `NG-15` permanece vermelho.

## Gate final da árvore candidata

Os gates abaixo foram executados na árvore integrada em `e0ac726`. O build integral foi
isolado porque havia servidores Next ativos no checkout principal.

| Comando | Resultado | Horário |
|---|---|---|
| `pnpm lint` | verde | 2026-09-10 |
| `pnpm test` | verde — Turbo 9/9; storefront 199, backoffice 246, API unit 779, contracts 404, UI 227, DB 35 e print-agent 31 | 2026-09-10 |
| `pnpm build` | verde — Turbo 7/7 em checkout isolado | 2026-09-10 |
| `pnpm --filter api test:e2e` | bloqueado pelo ambiente — Redis local recusou conexão; execução encerrada após 16 arquivos falhos por timeout, 2 passaram | 2026-09-10 |
| `pnpm --filter @molho/storefront test:e2e` | 3/3 verde em checkout isolado | 2026-09-09 |
| `pnpm verify:front-release` | vermelho no build integrado — 2 artefatos compilados contêm a URL de staging originada no fluxo de impressão de ownership C2; a credencial de staff não aparece mais | 2026-09-10 |

O gate global permanece vermelho. Para repetir o E2E da API é necessário disponibilizar o
Redis esperado pela suíte; para liberar a varredura, C2 deve remover
`api.staging.molho.live` de
`apps/backoffice/app/gestor/impressao/printer-settings.tsx` e reconstruir os fronts.
O verificador também exige `BUILD_ID` em cada `.next`, impedindo que uma saída parcial de
`next dev` seja aceita como build de release.

Uma alteração não commitada desse arquivo, feita fora da trilha Codex durante o gate,
já troca a URL por `https://api.molho.live`; ela foi preservada no workspace, mas não foi
incorporada nem atribuída ao Codex sem o handoff C2 correspondente.
