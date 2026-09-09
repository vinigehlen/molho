# Evidências CC — trilha backend/infra (Plano Zero NO-GO)

Registro de handoff e evidências da trilha CC. Ver `docs/15-divisao-zero-no-go-codex-cc.md`
(ownership de arquivos e ordem de merge) e `docs/14-plano-zero-no-go.md` (backlog NG-*).

**DRI CC responde por:** `NG-05`, `NG-06`, `NG-07`, `NG-08` (parte API), `NG-10`, `NG-11`,
`NG-12`, `NG-13`.

Somente o Codex marca a matriz central de `docs/14-plano-zero-no-go.md`. Este arquivo é a
fonte de evidência do CC; cada pacote C* usa o template da seção 8 do doc 15.

---

## C0 — desbloqueio (Onda 0)

**Entrega:** C0 — inventário de acessos, recursos e migrations; desenho da credencial de
impressão; auditoria do código atual. Sem edição de código (regra da Onda 0: não editar
até os contratos da seção 4 do doc 15 estarem fechados).
**Branch / SHA base:** `main` @ `51ff9e6c19bccc38f1f4274a0ba3e23d689285d6`
**NO-GO cobertos:** preparação de `NG-05`–`NG-08`, `NG-10`–`NG-13`.
**Arquivos alterados:** somente este documento.
**Migrations:** nenhuma nesta entrega (listadas abaixo as previstas).
**Variáveis novas:** nenhuma criada; nomes propostos abaixo (sem valores).
**Comandos executados:** leitura/auditoria apenas.
**Riscos restantes:** todos os itens de C0 dependem de gate humano (`NG-01`) ou do
congelamento dos contratos da seção 4.
**Rollback:** remover este arquivo.
**Próximo ponto de integração:** `ZG-0` verde → iniciar C1 (`NG-05` + parte backend de
`NG-04`).

### C0.1 — Acessos técnicos necessários (bloqueio humano, `NG-01`)

Acesso administrativo, com papel que permita criar recurso novo e ler secrets, a:

| Serviço | Uso na trilha CC | NO-GO |
|---|---|---|
| **Neon** | criar projeto produtivo limpo em `aws-sa-east-1`, plano com restore de 30 dias, roles, branch protegida, restore drill | `NG-10`, `NG-05` |
| **Upstash** | criar Redis produtivo exclusivo em São Paulo (`sa-east-1`), TLS, credencial exclusiva | `NG-11` |
| **Fly.io** | criar app `molho-api` em `gru`, secrets, certificado de `api.molho.live` sem apontar DNS | `NG-12` |
| **Cloudflare R2** | criar bucket produtivo, credencial de menor privilégio, custom domain | `NG-13` |
| **Cloudflare DNS** | criar registro do custom domain de assets (sem tocar em `molho.live` produtivo) | `NG-13` |
| **Sentry** | criar projeto/ambiente da **API** (os 3 fronts são do Codex), DSN, release | `NG-08` |
| **Resend** | confirmar domínio Verified e SPF/DKIM/return-path/DMARC (compartilhado com Codex; CC valida do lado da API) | `NG-08`, `NG-14` |

Decisões humanas que travam a trilha CC (subconjunto de `NG-01`):

- [ ] **domínio de assets** registrável e separado de `molho.live` — nome escolhido e
  registrado (bloqueia `NG-13`; `r2.dev` não é aceito pelo plano);
- [ ] **plano Neon** com janela de restore de 30 dias contratado (bloqueia `NG-10`);
- [ ] confirmar que o nome de app Fly **`molho-api`** está livre (nomes Fly são globais) —
  se tomado, PM define o nome antes de qualquer `fly apps create`;
- [ ] responsável técnico / plantonista nomeado e canal de incidente definido (destinatário
  dos alertas de `NG-08`).

### C0.2 — Migrations e recursos externos que serão criados pela trilha CC

**Migrations Prisma (fluxo seguro obrigatório — `docs/07`: `migrate dev --create-only` →
editar SQL → `migrate deploy` → `generate`; nunca `migrate dev` liso):**

1. `NG-06` — tabela `print_devices` (tenant-scoped): colunas, índice composto iniciando por
   `tenant_id`, FK, RLS, auditoria. Migration expansiva. Detalhe em C0.3.
   - Sem alteração destrutiva em `print_jobs` (já existe, Épico 10).
2. `NG-05`/`NG-07` — nenhuma migration esperada (config e readiness são código de app).
   Se `/ready` precisar de uma query dedicada, será `SELECT 1`, sem schema.

**Recursos externos (nenhum reaproveitado de staging — doc 14 §2.3):**

- **Neon:** projeto novo; branch produtiva protegida; `bootstrap.sql` como owner; roles
  `app_runtime` (pooled, menor privilégio, runtime) e `app_migrator` (direta, só migration
  job); `prisma migrate deploy` em runner sem segredo em linha de comando; auditoria de
  ownership de tabelas e de **todas** as políticas RLS; prova fail-closed sem
  `app.tenant_id`; branch/restore isolado + registro de RPO/RTO.
- **Upstash:** database produtivo exclusivo em São Paulo; TLS; credencial exclusiva (não
  reusar a de staging); alerta de indisponibilidade/latência.
- **Fly:** app `molho-api` em `gru`, 2 máquinas sempre ligadas, rolling deploy; secrets
  produtivos no secret store; graceful shutdown + fechamento SSE com `server_shutdown`
  (já em `main.ts` via `enableShutdownHooks`); checks `/health` (liveness) e `/ready`
  (readiness); primeiro publish em `molho-api.fly.dev`; imagem/release anterior registrada
  para rollback; certificado de `api.molho.live` criado sem apontar DNS.
- **R2:** bucket produtivo; credencial de menor privilégio com rotação documentada; custom
  domain no domínio de assets; CORS de upload restrito a `https://app.molho.live`;
  validação server-side de tipo/tamanho (reusar allowlist sem SVG — `docs/07`); sem
  default `r2.dev` na config produtiva.
- **Sentry (API):** projeto/ambiente `api` + DSN + environment + release SHA; scrubbing de
  telefone, e-mail, endereço, cookies, tokens, OTP e body de checkout; sourcemaps sem
  segredo; alertas para erro de checkout, autenticação, stream, impressão e taxa anormal
  de 5xx; uptime externo para `/health` e `/ready`.

### C0.3 — Desenho da credencial do agente de impressão (`NG-06`)

**Problema atual (auditado):** o agente (`apps/print-agent/src/config.ts`) usa
`MOLHO_STAFF_ACCESS_TOKEN` — access token de staff, expira em ~15 min, autorizado pelo
`JwtAuthGuard` na rota `/v1/admin/printing/*` com `@RequirePermission('order.view')`.
Não há credencial de dispositivo, nem revogação, nem escopo restrito a impressão.

**Ordem obrigatória (doc 14 `NG-06` / AGENTS.md):** contratos → Prisma/migration → API →
agente → UI de pareamento → testes.

**Tabela `print_devices` (tenant-scoped, RLS):**

| Coluna | Tipo | Nota |
|---|---|---|
| `id` | uuid v7 (`uuidv7()`) | PK |
| `tenant_id` | uuid | FK → `tenants(id)` `ON DELETE CASCADE`; primeiro campo do índice composto |
| `name` | text | rótulo do dispositivo escolhido no pareamento |
| `token_prefix` | text | primeiros ~8 chars do segredo, em claro — lookup e exibição ("•••• a1b2") |
| `token_hash` | text | hash do segredo (argon2id ou scrypt); **nunca** o segredo em claro |
| `version` | int default 0 | rotação incrementa; token antigo para de valer |
| `scope` | text default `'printing'` | escopo fixo; sem autorização por role |
| `last_seen_at` | timestamptz null | atualizado com throttle (ex.: no máx. 1×/60s) |
| `revoked_at` | timestamptz null | revogação; guard passa a negar imediatamente |
| `revoked_by` | uuid null | `users.id` de quem revogou (auditoria) |
| `created_by` | uuid | `users.id` de quem pareou |
| `created_at` / `updated_at` | timestamptz | |
| `deleted_at` | timestamptz null | soft delete; unique de `name` vira índice parcial |

RLS `USING (tenant_id = current_setting('app.tenant_id')::uuid)`, fail-closed. FK composta
onde aplicável. Toda emissão/rotação/revogação grava em `audit_log`.

**Segredo:** gerado uma vez no pareamento, formato `molho_pd_<base32 de 32+ bytes>`,
exibido **uma única vez** na UI, persistido só como `token_hash` + `token_prefix`.

**Autenticação do agente (nova, separada do staff):**

- Namespace dedicado para o agente — proposta: `/v1/printing/agent/*` (claim / printed /
  failed), **fora** de `/v1/admin/*`, para não herdar `JwtAuthGuard` nem a semântica de
  sessão de staff, e para manter o raciocínio de allowlist do BFF do Codex limpo.
- Novo `PrintDeviceAuthGuard`: lê `Authorization: Bearer molho_pd_...` + `x-tenant-id`;
  resolve o device por (`tenant_id`, `token_prefix`), compara `token_hash`, exige
  `revoked_at IS NULL` e `version` correta; abre contexto sintético
  (`{ tenantId, isPrintDevice: true }`); `@RequireModule('printing.escpos')` continua
  valendo (estado entitled AND enabled AND released).
- `last_seen_at` atualizado com throttle, fora do `RequestContextService.run()` do handler
  se possível (mesma regra de I/O pré-handler).

**Gestão do dispositivo (staff):** rotas `/v1/admin/printing/devices` (criar / listar /
rotacionar / revogar) sob `JwtAuthGuard` + `@RequireModule('printing.escpos')` +
`@RequirePermission(...)`. **Decisão de contrato RBAC pendente:** hoje não existe permissão
adequada (`order.view` é leitura de pedido, fraca demais para gerenciar credencial). Proposta:
nova permissão `printing.device.manage`, concedida a `owner` e `manager`. Precisa entrar em
`packages/contracts/src/permissions.ts` — combinar com o Codex antes do PR (contrato
compartilhado).

**Agente (`apps/print-agent`):**

- trocar `MOLHO_STAFF_ACCESS_TOKEN` por `MOLHO_PRINT_DEVICE_TOKEN` (obrigatório);
- `MOLHO_API_URL` continua obrigatória e **sem default de staging** (já é o caso);
- estado "credencial revogada" acionável: ao receber 401/403 persistente, o agente para de
  fazer claim, loga estado claro e não fica em retry infinito silencioso;
- reconexão com backoff;
- idempotência: `claimNext` já entrega job em lease; `markPrinted` já trata 409 (optimistic
  lock) como "outro worker/lease concluiu" — o agente não reimprime. Cobrir com teste o
  caminho restart-no-meio-do-job.

**Testes mínimos (doc 14):** emissão, uso, expiração/rotação, revogação, tenant cruzado,
módulo desligado, job duplicado, restart e segredo não logado.

**Aceite:** agente imprime em teste contínuo de 60 min, reconecta após restart, não duplica
ticket, para imediatamente ao revogar o dispositivo.

### C0.4 — Auditoria do código atual (gaps por NO-GO)

**`NG-05` (config fail-fast) — parcial.**
- Existe guarda de produção só em `messaging.module.ts` (`selectMessagingProvider` /
  `selectEmailProvider`: em produção, sem chave e com canal OTP em uso → `throw` no boot).
- **Falta:** schema de ambiente por app; guarda para `StorageModule`
  (`apps/api/src/storage/storage.module.ts` cai para `MockStorageProvider` só com `warn`
  quando `S3_ACCESS_KEY_ID` ausente — inaceitável em produção); guarda para Redis
  (`TokenModule`, `OtpModule`, `StorageModule`, `orders` realtime caem para stores
  in-memory quando `REDIS_URL` ausente, sem erro); validação de que `DATABASE_URL` é
  pooled e usa `app_runtime`; rejeição de URL com `staging`/`localhost`/`vercel.app`/
  `r2.dev`; garantir `MOLHO_DEBUG_PUBSUB` falso; `DIRECT_URL` fora do runtime.
- `main.ts` não valida env no bootstrap. Config deve virar função exportada e testável
  (`docs/07`: config só no `main.ts` é intestável).
- `apps/api` não carrega `.env.local` sozinho (`docs/07`) — validação roda contra env da
  plataforma.

**`NG-06` (credencial de impressão) — não iniciado.** Ver C0.3.

**`NG-07` (readiness) — não iniciado.**
- Só existe `/health` (`apps/api/src/health/health.controller.ts`): resposta estática,
  sempre `status: ok`, sem I/O. Serve como liveness.
- `fly.toml` só tem check em `/health`.
- **Falta:** `/ready` com query DB + ping Redis independentes, timeout curto por
  dependência, não-2xx se dependência obrigatória falhar; check Fly em `/ready`;
  garantir que readiness não usa tenant request context indevidamente e não estoura o pool.

**`NG-08` (Sentry/alertas/scrubbing) — parcial.**
- `apps/api/src/bootstrap/sentry.ts` existe (`initSentry` chamado no `main.ts`).
- **Falta auditar:** scrubbing de PII (telefone/e-mail/endereço/cookies/tokens/OTP/body de
  checkout), environment + release SHA, alertas (checkout, auth, stream, impressão, 5xx),
  uptime externo de `/health` e `/ready`, destinatário/escalonamento.

**`NG-10` (Neon/RLS/restore) — infra não criada.** RLS já é padrão do schema; falta o
projeto produtivo, roles, restore drill, prova fail-closed e registro de RPO/RTO.

**`NG-11` (Redis produtivo/cross-instance) — mecanismo provado, infra não criada.**
- Fan-out cross-instância via `RedisOrderEventBus` provado em staging real (`docs/07`,
  2026-09-08, `molho-api-staging` v36). Em produção vira **re-verificação de config**: as
  2 máquinas estabelecem `psubscribe` e `REDIS_URL` aponta para a mesma instância.
- **Falta:** Upstash produtivo; garantir ausência de fallback para memória em produção
  (ligado ao `NG-05`); alerta.

**`NG-12` (Fly produtiva) — não criada.** App `molho-api` não existe; `fly.toml` atual é do
`molho-api-staging`. Precisa parametrizar/duplicar sem tocar no app de staging.

**`NG-13` (R2 produtivo/domínio de assets) — não criado.** `StorageModule` monta
`R2StorageProvider` a partir de `S3_*`; `public-url.ts` usa `S3_PUBLIC_URL`. Falta bucket,
credencial, custom domain, CORS restrito, e remoção de default `r2.dev`.

### C0.5 — Bloqueios (mantêm o gate vermelho)

1. `NG-01` incompleto: acessos (C0.1) e decisões (domínio de assets, plano Neon, nome do
   app Fly, plantonista).
2. Contratos da seção 4 do doc 15 não congelados — a Onda 0 proíbe editar código antes
   disso. Itens que a trilha CC precisa ver fechados: variável server-only
   `MOLHO_API_INTERNAL_URL`; papéis/URLs de banco (`DATABASE_URL` pooled `app_runtime`,
   `DIRECT_URL` direta `app_migrator`); contrato da credencial de impressão (incl. a nova
   permissão `printing.device.manage` — combinar com o Codex).
3. Nenhum agente aponta DNS nem publica `channel.storefront` nesta fase.

---

## NG-10 — banco produtivo, RLS e restore (parcial — 2026-09-09)

**Entrega:** Neon `molho-prod` provisionado e schema aplicado.
**NO-GO:** `NG-10` (parcial).

| Item | Estado | Evidência |
|---|---|---|
| Projeto Neon limpo em `aws-sa-east-1` | ✅ | projeto `orange-violet-39774090`, branch `main` (`br-gentle-morning-ac28qhx6`), PG 18, plano Free |
| Roles menor privilégio | ✅ | `app_migrator` (LOGIN CREATEDB, `rolbypassrls=false`), `app_runtime` (LOGIN, `rolbypassrls=false`, `rolcreatedb=false`) — criadas por SQL como `neondb_owner` via `bootstrap.sql`; idênticas ao staging. Primeira tentativa via API do Neon nasceu com `BYPASSRLS` e foi descartada. |
| PostGIS + grants de schema | ✅ | `CREATE EXTENSION postgis`; `public` revogado de `PUBLIC`; USAGE/CREATE→migrator, USAGE→runtime |
| `prisma migrate deploy` | ✅ | 47 migrations aplicadas de uma vez; `_prisma_migrations` = 47 finished. Rodado via `dotenv -e docs/go-live/.env.neon-prod.local` (sem segredo em linha de comando) |
| Schema == staging | ✅ | prod e staging: 44 tabelas, 45 policies, 38 tabelas com RLS, 47 migrations |
| Toda tabela com `tenant_id` tem RLS | ✅ | query de auditoria retornou 0 tabelas sem RLS |
| Função de isolamento | ✅ | `app_tenant_visible()` usa `current_setting('app.tenant_id', true)::uuid` — unset ⇒ NULL ⇒ linha filtrada (fail-closed por construção) |
| Prova RLS A/B em runtime (role `app_runtime`) | ✅ | `docs/go-live/rls-probe.mjs` (conecta como `app_runtime`, `is_superuser=off`, transação + ROLLBACK): `ctx_A`→1 ProbeA, `ctx_B`→1 ProbeB, `ctx_unknown`→0 (fail-closed), gravar linha de outro tenant → `42501 new row violates row-level security policy` |
| Branch produtiva protegida | ⚠️ | Free permite só 1 branch protegida na org e o staging já usa. Fica desprotegida no piloto; reavaliar ao trocar de plano |
| `pg_dump` noturno (retenção 30 dias) | ⏳ | Infra-1; substitui o restore de 30 dias que o Free não dá (history = 6h) |
| Restore drill | ⏳ | Infra-1: criar branch/restore isolado, validar integridade, registrar RPO/RTO |

**Riscos restantes:** senhas das roles geradas nesta sessão (`token_urlsafe(24)`) — rotacionáveis
via `ALTER ROLE ... PASSWORD` antes do go-live se desejado. Free tier: compute escala a zero
(cold start no primeiro pedido após ocioso) e history de restore = 6h — mitigado pelo dump
noturno.
**Rollback:** `mcp__Neon__delete_project orange-violet-39774090`.
**Próximo:** proteger branch (bloqueado no Free); Infra-1 (dump + restore drill).

---

## NG-11 — Redis produtivo (parcial — 2026-09-09)

| Item | Estado | Evidência |
|---|---|---|
| Upstash exclusivo em São Paulo | ✅ | database `molho-prod`, endpoint `legible-mosquito-152891.upstash.io:6379`, região `aws sa-east-1`, plano Free, TLS Enabled |
| TLS + credencial exclusiva | ✅ | `rediss://`, token próprio (não reusa staging) |
| `REDIS_URL` em `.env.prod.local` | ⏳ | placeholder; token a preencher do painel |
| Sessão/refresh/rate limit/pub-sub | ⏳ | C3/C5 — validar contra a API produtiva |
| Restart de máquina + reconexão | ⏳ | C5 (precisa Fly) |
| Sem fallback pra memória em produção | ⏳ | `NG-05` (C1) — hoje `TokenModule`/`OtpModule`/`StorageModule`/realtime caem pra in-memory sem `REDIS_URL` |
| Alerta de indisponibilidade/latência | ⏳ | `NG-08` |

Fan-out cross-instância do mecanismo já provado em staging real (`docs/07`, 2026-09-08).
Em produção vira re-verificação de config (C5).

---

## NG-01 — decisões PM e acessos (fechado — 2026-09-09)

**Entrega:** ata `docs/go-live/ata-ng-01.md` — decisões PM travadas e acessos confirmados.
DRI é o Codex; a ata é o insumo para ele ratificar e marcar a matriz central.

Decisões que afetam a trilha CC (ver ata §1):

| Item | Decisão | NO-GO |
|---|---|---|
| Plano Neon | **Free** + `pg_dump` noturno 30 dias no R2 (`s3://molho-backups/`). RPO ≤ 24h, RTO ~30 min | `NG-10` |
| Assets | **`r2.dev` público** (`S3_PUBLIC_URL=https://pub-<hash>.r2.dev`); domínio próprio pós-piloto | `NG-13` |
| Permissão de impressão | **reusar `team.manage`** — sem permissão nova, sem tocar `packages/contracts` | `NG-06` |
| `checkout.guest` | desligado | `NG-03` (Codex) |
| Pagamentos | PIX estático + dinheiro + cartão na entrega | `NG-15` |
| Dry run | alvo **2026-09-11** | `NG-15` |

Acessos (Vercel, Fly, Neon, Upstash, Cloudflare, R2, Resend, Sentry): confirmados com o PM.

**Ainda amarelo em `NG-01`** (gates humanos distintos, não bloqueiam C1–C5): aceite jurídico,
contato do operador Cabanhas, aceite do Cabanhas, confirmar nome `molho-api` livre na Fly.

**Contratos da seção 4 do doc 15:** `docs/go-live/contratos-cc.md` §4 agora sem decisão PM
pendente — pronto para o Codex congelar. Desbloqueia **C1** (`NG-05`).

---

## C1 — NG-05 (config fail-fast) + NG-07 (readiness) — 2026-09-09

**Entrega:** `api: fail-fast de config em produção + readiness /ready (NG-05, NG-07)`
**Branch / SHA:** `cc/no-go-backend-infra` @ `be3362c`
**NO-GO cobertos:** `NG-05` (código; falta a matriz de env no Fly = C4/C5), `NG-07` (código;
falta o check `/ready` na `fly.toml` produtiva = `NG-12`).

**Arquivos:**
- `apps/api/src/bootstrap/validate-env.ts` (+ test) — `validateProductionEnv()` no `main.ts`
  antes de `NestFactory.create`.
- `apps/api/src/health/readiness.{service,controller}.ts` (+ service test) — `GET /ready`.
- `apps/api/src/main.ts`, `app.module.ts`, `context/context.module.ts` (exporta
  `PRISMA_CLIENT`), `apps/api/fly.toml` (check em `/ready`).

**Migrations:** nenhuma.

**Variáveis novas:** nenhuma. `NG-05` passa a EXIGIR no boot (produção) o que já existe no
`.env.example`: `DATABASE_URL` (pooled + role `app_runtime` + sem `staging`/`localhost`/
`vercel.app`), `REDIS_URL` (`rediss://`), `S3_*` (todas as 6, incl. `S3_PUBLIC_URL`),
`MOLHO_ENCRYPTION_KEYS`/`MOLHO_OTP_HMAC_KEY`/`MOLHO_EMAIL_PEPPER`/`MOLHO_JWT_SECRETS`,
`MOLHO_CORS_ORIGINS` (https, sem curinga), `MOLHO_DEBUG_PUBSUB` desligado. `S3_PUBLIC_URL`
em `r2.dev` é aceito (ata NG-01 §1.6).

**Comandos:** `vitest run` (API 760 verde, +23 novos), `eslint` (0), `tsc --noEmit` (0),
`nest build` (0). E2E não rodado nesta entrega.

**Decisões de implementação:**
- Guarda ÚNICA no boundary (`main.ts`), não em cada módulo — os ternários
  `REDIS_URL ? Redis : InMemory` espalhados resolvem sozinhos pro caminho real quando o
  boot garante a env. Não toquei `storage.module.ts` nem os outros.
- `DIRECT_URL` fora do runtime: **não** validado (nada na API lê `DIRECT_URL`; um check aqui
  poderia estourar no job de migration, que compartilha env). Fica pro runner de migration.
- Guardas per-canal do `MessagingModule` (Resend/Zenvia) não duplicadas — já falham o boot.
- `/ready`: `SELECT 1` + Redis `PING`, 1,5s de timeout cada, em paralelo, fora do request
  context. Redis `skipped` sem `REDIS_URL` (só dev).

**Riscos:** e2e de `/ready` contra infra real ainda não escrito (precisa Redis local + Neon).
**Rollback:** reverter `be3362c`. `validateProductionEnv` é no-op fora de produção.

---

## C2 — NG-06 impressão + plug & play na Elgin/Bematech i7 — 2026-09-09

**Objetivo do usuário:** impressora funcionando **já em staging**, plug & play, Windows e Mac.

**Branch:** `cc/no-go-backend-infra` @ `38e19ce` (commits `aed0990`, `8a137eb`, `38e19ce`).

### O que entrou

| Camada | Entrega |
|---|---|
| **Migration** | `20260909163000_print_devices` — tabela tenant-scoped, RLS **FORCE** (igual `print_jobs`), índices parciais (lookup por prefixo, nome único/loja), FKs `tenants`/`users`, soft delete. Model Prisma `PrintDevice`. |
| **API** | `PrintDeviceService` (pair/rotate/revoke + authenticate/heartbeat), `PrintDeviceAuthGuard` (`Bearer molho_pd_...`, contexto de plataforma pro lookup, 401 uniforme), `PrintDeviceContextInterceptor`. `PrintingAgentController` `/v1/printing/agent/{jobs/claim,jobs/:id/printed,jobs/:id/failed}` — mesma semântica claim/lease/optimistic-lock, ator = dispositivo. `PrintDeviceAdminController` `/v1/admin/printing/devices` sob `team.manage`. Segredo: `molho_pd_<32B base64url>`, **scrypt** (node:crypto, sem dep), prefixo de 12 chars. Auditoria em pair/rotate/revoke. |
| **Agente** | `SystemPrinter`: RAW pelo **spooler do SO sem dep nativa** — macOS/Linux `lp -o raw`, Windows `WritePrinter`/winspool via PowerShell. Auto-detecta a impressora (nome exato → regex de térmica → 1ª da lista). `codepage.ts`: **CP850** (default) e CP860 — acento de verdade (`ESC t n` + encode na página); `ascii` como fallback. Auth trocada pra `MOLHO_PRINT_DEVICE_TOKEN`; `MOLHO_TENANT_ID` vira opcional. 401/403 → backoff 30s, sai código 1 após 5x. |
| **Backoffice** | Configuração → Impressora: "Dispositivos de impressão" — parear (código mostrado 1×, copiar), listar (último visto), gerar novo código, revogar. |

**Decisões:** scrypt (não argon2, sem dep); rotas do agente em namespace próprio `/v1/printing/agent/*` (não herda `JwtAuthGuard`); `team.manage` (ata NG-01); transporte via spooler do SO com PowerShell no Windows (sem `@thiagoelg/node-printer` nativo — evita churn de pnpm-lock e dor de empacotamento).

**Testes:** API 774 verde (+ segredo, service). print-agent 30 verde (codepage cp850/cp860, seleção de impressora, rota do agente, 401/403). Backoffice build ok. `tsc`/`eslint` ok nos 4 pacotes. Falhas pré-existentes em `staff-session`/`order-queue`/`staff-auth` (localStorage sob Node 26) **não** são desta mudança.

### FALTA pra funcionar em staging (ações do usuário)

1. **Aplicar a migration em staging** (bloqueado pro agente pelo classifier):
   ```
   ! cd packages/db && npx dotenv-cli -e ../../.env.local -- pnpm exec prisma migrate deploy
   ```
   (`.env.local` já aponta pra staging `ep-floral-water-ac7pi7e3` = projeto Neon `molho-staging`.)
2. **Deploy da API de staging** com o código deste branch (rotas novas do agente).
3. No backoffice de staging (loja piloto, módulo `printing.escpos` ativo): **Configuração → Impressora → Parear dispositivo** → copiar o `molho_pd_...`.
4. No PC da loja (Mac ou Windows) com a i7 ligada e o driver instalado (só Windows):
   ```
   MOLHO_API_URL=https://api.staging.molho.live \
   MOLHO_PRINT_DEVICE_TOKEN=molho_pd_... \
   MOLHO_PRINT_FORMAT=escpos \
   pnpm --filter @molho/print-agent start
   ```
   Teste seco antes: `MOLHO_PRINT_FORMAT=escpos pnpm --filter @molho/print-agent test-print`.

**Riscos:** e2e do fluxo do agente não escrito (precisa a migration aplicada). CP850 vs CP860 na i7 — confirmar no teste físico, é trocar `MOLHO_PRINT_CODEPAGE`. macOS: a i7 precisa estar adicionada como impressora (Ajustes) ou fila CUPS raw. Empacotamento (executável único + serviço) não feito — próxima fatia.
**Rollback:** reverter os 3 commits; `DROP TABLE print_devices` em staging.

### C2.1 — fix: comanda pelo agente, não pelo navegador (`3cd6fb3`)

Reportado no teste em staging: clicar no ícone de impressora no card do pedido
abria o diálogo `window.print()` do SO e mandava PDF/PostScript pra térmica.

Causa: `PrintJobConsumer` (consumidor "prova de conceito" pelo navegador) rodava
na aba do gestor, reivindicava o job e chamava `window.print()`. Removido de
`gestor/page.tsx`; deletados `print-job-consumer.tsx` e `kitchen-ticket.tsx`
(mortos — `kitchen-ticket.tsx` já não era importado). O botão "Imprimir" só
enfileira; quem imprime é o agente (ESC/POS cru, sem diálogo).

**Cross-ownership:** `gestor/page.tsx` e esses dois componentes são do Codex pelo
doc 15. Mudança mínima (unmount + delete de código morto). **Codex: revisar no
rebase** — se a árvore não-commitada de vocês tocou esses arquivos, é
delete/modify; os componentes estavam mortos, a decisão certa é aceitar o delete.
