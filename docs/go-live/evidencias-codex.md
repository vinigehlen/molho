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
  no ambiente Production, junto de root domain, path mode, slug técnico e origin R2;
- `molho-backoffice-prod`: `NEXT_PUBLIC_API_URL=https://molho-api.fly.dev` foi gravada no
  ambiente Production, junto da origin R2;
- `molho-site`: somente `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_APP_URL` em Production.

Validação da API técnica em 10/09/2026:

- `GET https://molho-api.fly.dev/ready`: HTTP 200, `db=ok`, `redis=ok`;
- `fly status -a molho-api`: duas máquinas `started` em `gru`, ambas com 2/2 checks
  passando.

O certificado de `api.molho.live` foi criado e permanece `Not verified`, como esperado,
até o apontamento de DNS autorizado somente depois de `ZG-5`.

O handoff C4 entregou `MOLHO_ASSETS_ORIGIN` e o valor foi gravado na storefront e no
backoffice. O merge de `cc/no-go-backend-infra@748574e` também removeu a URL de staging
do comando de impressão. A nova varredura examinou 428 artefatos e encontrou zero
endpoint proibido.

Bloqueios do RC: DSNs Sentry, revisão jurídica e confirmação de e-mail. Portanto
`NG-14` continua vermelho e nenhum RC de produção foi criado.

## Coordenação NG-10

- `.github/workflows/pg-backup.yml` agenda `scripts/pg-backup.sh` diariamente às 06:17
  UTC e permite disparo manual;
- usa `postgres:18-bookworm`, concorrência única, timeout de 30 minutos e permissão
  `contents: read`;
- `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID` e `AWS_SECRET_ACCESS_KEY` foram configurados como
  Actions secrets sem registrar valores;
- o primeiro disparo em `main@3667c8e` chegou ao `pg_dump`, mas recusou a tabela
  `print_devices`: `DIRECT_URL` usa `app_migrator`, role sem `BYPASSRLS`, e a tabela usa
  `FORCE ROW LEVEL SECURITY`;
- o workflow foi corrigido para exigir `BACKUP_DATABASE_URL`, separada de migration e
  restrita a leitura integral para backup. Falta fornecer essa URL e repetir o job;
- restore drill numa branch Neon isolada ainda é obrigatório para fechar `NG-10`.

## R5 — NG-15

Checklist operacional preparado em `docs/go-live/checklist-dry-run-cabanhas.md`. Nenhum
tenant foi publicado e `channel.storefront` não foi habilitado. O dry run físico e os
aceites continuam pendentes; `NG-15` permanece vermelho.

## Gate final da árvore candidata

Os gates abaixo foram repetidos depois do merge de `cc/no-go-backend-infra@748574e` e da
criação do workflow de backup.

| Comando | Resultado | Horário |
|---|---|---|
| `pnpm lint` | verde | 2026-09-10 |
| `pnpm test` | verde — Turbo 9/9; storefront 199, backoffice 246, API unit 779, contracts 404, UI 227, DB 35 e print-agent 31 | 2026-09-10 |
| `pnpm build` | verde — Turbo 7/7 em checkout isolado | 2026-09-10 |
| `pnpm --filter api test:e2e` | bloqueado pelo ambiente — Redis local recusou conexão; execução encerrada após 16 arquivos falhos por timeout, 2 passaram | 2026-09-10 |
| `pnpm --filter @molho/storefront test:e2e` | 3/3 verde na árvore integrada | 2026-09-10 |
| `pnpm verify:front-release` | verde — 428 artefatos, zero endpoint proibido | 2026-09-10 |

O gate de código/fronts está verde. O E2E integral da API continua registrado na trilha CC;
o RC Vercel segue bloqueado pelo Sentry obrigatório e pelos gates externos descritos acima.
