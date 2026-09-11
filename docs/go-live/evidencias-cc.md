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

### C2.2 — deploy em staging (2026-09-09)

**API `molho-api-staging` → v41** (`fly deploy`, imagem `deployment-01M240WNHTCQ89HVF24DG0BQYT`).
- 1º deploy **falhou** e o NG-05 pegou um problema real: `MOLHO_DEBUG_PUBSUB` estava
  ligado no secret store do staging (`NODE_ENV=production` lá). `validate-env` recusou o
  boot, máquina entrou em crash-loop, deploy abortou — staging seguiu na v39 (sem outage).
  Fix: `fly secrets unset MOLHO_DEBUG_PUBSUB`.
- 2º deploy verde. **2 máquinas em `gru`, checks 2/2 passing:**
  `/health` → `{"status":"ok"}`; `/ready` → `{"status":"ready","db":"ok","redis":"ok"}`.
  NG-07 confirmado num ambiente Fly real (o Fly checa `/ready` nas duas).
- Rotas novas respondendo: `POST /v1/printing/agent/jobs/claim` → 401 (não 404),
  `GET /v1/admin/printing/devices` → 401. Rota velha de staff mantida.
- Máquina 1 tinha ficado presa no crash-loop do deploy falho → `fly machine start`.

**Backoffice `molho-backoffice-staging` → `staging-app.molho.live`** (`vercel deploy --prod`,
`dpl_ALS5nsxvDUxSkBAHaUu49kATFSSY`, READY). Fix da impressão pelo navegador (C2.1) no ar.
O projeto Vercel **não** deploya sozinho no push do `main` — é `vercel deploy` manual.

**Falta:** parear um dispositivo no backoffice de staging → rodar o agente no PC da loja
com a i7 (teste físico).

### C2.3 — e2e do fluxo do agente (2026-09-09)

`apps/api/src/printing/printing-agent.e2e.test.ts` — 9 casos contra o Neon de staging
(sem Redis; `MODULE_CACHE` = noop):

| Caso | Cobre |
|---|---|
| emissão | `POST /devices` devolve `molho_pd_` uma vez; `GET /devices` nunca devolve segredo nem `token_hash` |
| uso | agente reivindica → `ticketText` com o pedido → confirma `printed`; `last_seen_at` marcado |
| restart | reconfirmar com `version` velha → 409 (não reimprime) |
| rotação | segredo velho → 401; novo → 200; `version` incrementa |
| revogação | efeito imediato → 401 |
| tenant cruzado | segredo do B + `x-tenant-id` do A → 401; B não reivindica job do A |
| módulo desligado | claim do agente → 403 (`@RequireModule`) |
| segredo não logado | `audit_log` de paired/rotated/revoked não contém o segredo nem `molho_pd_` |
| isolamento de rota | token de staff na rota do agente → 401; segredo de device na rota de staff → 401 |

Roda: `pnpm --filter @molho/api test:e2e` (ou o arquivo isolado). 10/10 verde.

---

## C3 — numeração sequencial de pedido + 2 vias de comanda — 2026-09-10

**Pedido do usuário:** todo pedido único e identificável no tenant (saíam todos `#01A0`
— `shortOrderId` pegava o prefixo do UUID v7, que é timestamp); e a comanda vira 2 vias
(balcão para conferência + cozinha).

**Branch:** `cc/no-go-backend-infra` (merge `0f619aa` no `main`).

### Numeração (`#00001`, lifetime por tenant)
- migration `20260909180000_order_number`: `orders.order_number`, tabela
  `order_number_counters` (1 linha/tenant), trigger `BEFORE INSERT assign_order_number`
  (INSERT ... ON CONFLICT DO UPDATE — atômico, serializa concorrentes na linha do
  contador). Backfill dos pedidos existentes por `created_at`; semente do contador.
  RLS ENABLE (não FORCE, igual a `orders`). Pega checkout + balcão + futuro sem tocar
  em cada repo.
- Aplicada em staging: trigger ok, **0 pedidos sem número**, Cabanhas numerado 1→20
  (20 distintos), contador em 21.
- `AdminOrder.orderNumber` (contrato aditivo, nullable p/ legado) → card do gestor
  mostra `#00042`.

### Duas vias (sempre, delivery e retirada)
- `buildCounterTicket` **VIA BALCAO**: número, data/hora, tipo, prazo, agendamento,
  **nome + endereço completo**, itens **com valor**, subtotal/desconto/taxa/**total**,
  **forma de pagamento** (+ troco), observação. `currentTotalCents` quando há ajuste.
- `buildKitchenTicket` **VIA COZINHA**: número, nome, tipo, prazo, itens + adicionais +
  observação. **Sem preço, sem endereço, sem telefone.**
- `queueOrderTickets` enfileira 2 jobs (`<prefix>:counter` e `:kitchen`). Checkout
  auto-enfileira as 2; botão "Imprimir" reimprime as 2.
- `findOrderForTicket` expandido (pagamento, totais, endereço-snapshot, prazos, número).

**Removidos** `apps/backoffice/lib/kitchen-ticket.{ts,test.ts}` (mortos).

**Testes:** print-ticket (as 2 vias, `formatOrderNumber`, retirada, ajuste), printing.service
(2 jobs, prefixo, conteúdo), e2e `printing.e2e` 7/7 + `printing-agent.e2e` 10/10 contra
staging (rodados separados — juntos estouram o limite de transação do Neon Free). API
779 unit, contracts 404, tsc/lint/build ok.

**Deploy:** API `molho-api-staging` v43, backoffice `staging-app.molho.live`. Migration
aplicada antes do deploy (o código lê `orders.order_number`).

**Cross-ownership (doc 15):** `packages/contracts/admin-order.ts` (campo aditivo),
`apps/backoffice` (card/page/lib de impressão). Aditivo — mergeável no rebase do Codex.

---

## C4/C5 — infra produtiva: Fly + Redis + R2 provisionados — 2026-09-10

**Entrega:** API produtiva no ar em `molho-api.fly.dev` (sem DNS), Upstash e R2
de produção conectados. Fecha `NG-05`, `NG-07`, `NG-11`, `NG-12` (código +
runtime real); `NG-10` e `NG-13` parciais; `NG-08` pendente.
**Branch:** `cc/no-go-backend-infra`.

### Recursos externos criados

| Recurso | Detalhe |
|---|---|
| Fly app `molho-api` | `gru`, 2 máquinas `shared-cpu-1x`/512MB, `min_machines_running=2`, rolling. Cert `api.molho.live` criado, `Not verified` (DNS não apontado, correto até `ZG-5`). IPs: v4 shared `66.241.125.222`, v6 dedicado. |
| Upstash `molho-prod` | `legible-mosquito-152891`, `aws sa-east-1` (São Paulo), TLS, Pay-as-you-go. Só `REDIS_URL` (TCP) é usado pela API. |
| R2 `molho-uploads-prod` | conta `04f41f752ef10cb87fa8789e00ff61a0`, CORS `https://app.molho.live` (GET/PUT), Public Dev URL `pub-32e66ce2e40944ed8b5dc1dd8687621a.r2.dev` (piloto, ata NG-01). Bucket `molho-backups` criado pro `pg_dump`. Token de conta "Object Read & Write" escopado nos 2 buckets. |

### fly.prod.toml

`apps/api/fly.prod.toml` — cópia fiel de `fly.toml` (staging), só o nome do app
troca (`molho-api`). Manter os dois em sincronia. Deploy da raiz:
`fly deploy . -c apps/api/fly.prod.toml`.

### Secrets no Fly (17, todos `Deployed`)

Cifra/JWT/OTP-HMAC/e-mail-pepper **gerados frescos** pra prod (isolados de
staging). `RESEND_API_KEY` nova (`molho-api-prod`, mesmo domínio `send.molho.live`
verified — aprovado pelo PM reusar o domínio). `DIRECT_URL` **não** entra no
runtime (só no job de migration). Origem dos valores: `docs/go-live/.env.prod.local`
(gitignored).

### Migrations

`prisma migrate deploy` contra a prod: 49/49 aplicadas (faltavam
`print_devices` + `order_number` desde o C4).

### Gates executados

| Comando | Resultado |
|---|---|
| `fly deploy` (v1) | verde; imagem 142 MB; 2 máquinas criadas em `gru` |
| `GET /health` | `{"status":"ok","version":"0.1.0"}` |
| `GET /ready` | `{"status":"ready","db":"ok","redis":"ok"}` — **NG-07 confirmado em prod real** |
| checks Fly | 2 máquinas, 2/2 passing cada |
| boot | passou `validateProductionEnv` (**NG-05** provado com env de prod real) |

### Cross-ownership (doc 15)

`apps/backoffice/app/gestor/impressao/printer-settings.tsx` (CC-exclusivo):
comando de exemplo exibido ao operador tinha `api.staging.molho.live` — trocado
pra `api.molho.live`. Destrava o `scripts/verify-front-release.mjs` do Codex.

### Falta

- **NG-13:** smoke de upload real no R2 prod.
- **NG-10:** cron `pg_dump` noturno → `molho-backups` + restore drill + RPO/RTO.
- **NG-08:** Sentry da API (DSN prod, environment+release SHA, alertas, auditoria
  do scrubbing PII).
- **NG-11:** re-verificar fan-out cross-instância nas 2 máquinas de prod (mecanismo
  já provado em staging; em prod é só confirmar `psubscribe` nas duas).
- rollback drill Fly (`fly releases` / `fly deploy --image`).

**Handoff Codex:** `MOLHO_ASSETS_ORIGIN` = `https://pub-32e66ce2e40944ed8b5dc1dd8687621a.r2.dev`.
**Rollback:** `fly apps destroy molho-api`; recursos Upstash/R2 removíveis pelos painéis.

### NG-13 — smoke do R2 prod (2026-09-10)

`node docs/go-live/r2-smoke.mjs docs/go-live/.env.prod.local` (rodado com o
`@aws-sdk` de `apps/api`):

```
PUT uploads bucket: ok
GET via S3: match
GET via public URL: 200 match
PUT backup bucket: molho-backups ok
cleanup: ok
```

Bucket, credencial (token de conta escopado), public dev URL e o bucket de
backup provados end-to-end. **NG-13 fecha** (CORS de browser fica pro teste via
backoffice no dry run).

### NG-10 — status (2026-09-10)

`scripts/pg-backup.sh` pronto (dump plain + gzip → `s3://molho-backups/neon/`,
retenção 30d, RPO ≈ 24h). Falta: Codex ligar no cron do CI (workflow é dele) e
o restore drill numa branch Neon isolada com RTO registrado.

### NG-08 — descopado no piloto (2026-09-10)

Decisão PM registrada em `docs/go-live/ata-ng-01.md` §1 linha 12: Sentry da API
não entra no piloto. Não é dependência de boot (`validate-env` não checa,
`initSentry` vira no-op sem DSN). Trade-off aceito: sem alerta de erro e sem
agregação na API.

**Fallback do piloto:**
- `fly logs -a molho-api` + métricas Fly/Grafana;
- monitor de uptime externo no `/ready` (UptimeRobot/Better Uptime, free) →
  alerta pro canal de incidente da ata linha 11 (`superadmin.molho.live@gmail.com`
  + WhatsApp `51-99261-6964`);
- o próprio Fly já tira máquina da rotação em `/ready` != 2xx e reinicia em
  `/health` travado.

**Pós-piloto:** projeto Sentry `api`, DSN, environment+release SHA, alertas
(5xx/checkout/auth/stream/impressão), auditoria do scrubbing PII.

**Ação pendente do PM:** criar o monitor de uptime (3 min, sem código) apontando
`https://molho-api.fly.dev/ready`, alerta pro e-mail/WhatsApp da ata linha 11.

**Codex:** matriz `docs/14` §8 → `NG-08` (parte API) pode ir a verde com nota
"descopado no piloto, ata NG-01 §1 linha 12; fallback fly logs + uptime ping".

### NG-10 — backup + restore drill VERDES (2026-09-10)

**Backup:** `.github/workflows/pg-backup.yml` (Codex) rodou verde no 3º disparo:
```
==> pg_dump 20260910T193756Z
    20K
==> upload s3://molho-backups/neon/molho-neon-20260910T193756Z.sql.gz
==> retenção: apaga > 30 dias
==> ok
```
Dois ajustes foram necessários:
1. secret `DIRECT_URL` do GitHub estava vazio → preenchido (role `app_migrator`);
2. pg_dump travava em `print_devices`/`print_jobs` (RLS **FORCE**) com o role
   sem BYPASSRLS. Fix: `ALTER ROLE app_migrator BYPASSRLS` (role de CI —
   migration + backup —, nunca runtime; `app_runtime` segue `rolbypassrls=false`,
   a prova fail-closed do NG-10 não muda).

**Restore drill:** branch Neon isolada `restore-drill-20260910`
(`br-fancy-bread-ac78412o`), `DROP SCHEMA public CASCADE` (77 objetos) + restore
do dump baixado do R2:
```
restore: 17s (sem erro, ON_ERROR_STOP=1)
```
Paridade com a prod (via MCP): **46 tabelas, 47 policies, 40 RLS, 49 migrations,
postgis ok** — idêntico ao baseline.

- **RPO** ≤ 24h (cron 06:17 UTC).
- **RTO** ≈ 2 min pra este tamanho (17s restore + download + branch). Estimativa
  da ata (~30 min) fica com folga; revisar quando o Cabanhas tiver volume.

`docs/go-live/r2-get.mjs` — baixador de objeto R2 em node (sem awscli), usado no
drill.

**NG-10 fecha.** Falta só dropar a branch de drill.

---

## PARA O CODEX — handoff de fechamento da trilha CC (2026-09-10)

A sessão da conversa não alcança um Codex ativo; este bloco é o aviso.

### 1. Matriz `docs/14` §8 — marcar verde

| NG | Marcar | Nota |
|---|---|---|
| `NG-05` | 🟢 | fail-fast validado no boot real da Fly prod |
| `NG-07` | 🟢 | `/ready` 2/2 nas 2 máquinas de `gru` |
| `NG-08` | 🟢 (parte API) | **descopado no piloto** — ata NG-01 §1 linha 12; fallback = `fly logs` + métricas + uptime ping no `/ready`. Sentry da API pós-piloto |
| `NG-10` | 🟢 | backup noturno (`pg-backup.yml`) verde + restore drill 17s, paridade total. RPO ≤ 24h, RTO ~2min. Destrava a nota "restore drill isolado pendente" |
| `NG-11` | 🟢 | Upstash prod, `redis:ok`, restart drill (HA segurou). Fan-out A/B nas 2 máquinas fica no dry run |
| `NG-12` | 🟢 | `molho-api.fly.dev`, 2×gru, cert `api.molho.live` `Not verified` (correto). Rollback: `fly releases` / `fly deploy --image <anterior>` — exercitar no 1º bump de RC |
| `NG-13` | 🟢 | R2 prod smoke PUT/GET/public/backup |

### 2. Assets

`MOLHO_ASSETS_ORIGIN=https://pub-32e66ce2e40944ed8b5dc1dd8687621a.r2.dev` — já
gravado por você em storefront/backoffice Production.

### 3. Gates humanos — PM informou "definidos"

PM sinalizou que **jurídico, e-mail e os gates humanos** estão resolvidos.
Codex: registrar o conteúdo específico (quem aprovou o quê, config de e-mail
prod validada) em `evidencias-codex.md` / ata NG-01 §4, marcar `NG-14`/`NG-01` e
gerar o RC técnico (`vercel deploy --prebuilt --prod --skip-domain`).

### 4. Secrets do backup no GitHub Actions

`DIRECT_URL`, `S3_ENDPOINT`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`
setados. `DIRECT_URL` = role `app_migrator`, que agora tem `BYPASSRLS`
(necessário pro pg_dump ler tabelas RLS FORCE; role de CI, nunca runtime;
`app_runtime` intocado).

### 5. Sobra pro dry run (NG-15)

- NG-11: fan-out SSE cross-instância com as 2 máquinas ativas;
- NG-12: rollback real;
- impressão física 60 min.

## Fase 0 — preflight janela 5h (11/09/2026)

- `NG-01` aceito pelo PM (11/09/2026); `NG-08` confirmado backlog futuro/pós-piloto, não
  bloqueia o piloto de hoje.
- `origin/main` = local, sem divergência (`ee0276a`), `git status` limpo além dos docs em
  edição.
- `curl https://molho-api.fly.dev/ready` → HTTP 200, `{"status":"ready","db":"ok","redis":"ok"}`.
- Três deployments Vercel Ready (`vercel inspect`):
  - storefront `molho-storefront-prod-4kh9wk2pk-vinigehlens-projects.vercel.app`
  - backoffice `molho-backoffice-prod-4k131l9py-vinigehlens-projects.vercel.app`
  - site `molho-site-ahb1yatb5-vinigehlens-projects.vercel.app`

Preflight concluído. Próximo: Fase 1 (NG-14 domínios/DNS finais do sistema operacional
Cabanhas), site institucional fora do escopo de hoje.

## Fase 1 — NG-14 domínios/DNS (11/09/2026)

- DNS Cloudflare (`molho.live`, zona third-party): `app.molho.live` e `cabanhas-bbq.molho.live`
  criados como CNAME pros hosts recomendados pela Vercel
  (`40e1901676236d08.vercel-dns-017.com` e `790b98515474f389.vercel-dns-017.com`), proxy
  desligado (DNS only); `api.molho.live` CNAME pro Fly (`pezm29k.molho-api.fly.dev`).
- Domínios anexados aos projetos certos via `vercel domains add` (`app.molho.live` →
  `molho-backoffice-prod`, `cabanhas-bbq.molho.live` → `molho-storefront-prod`).
- Cert TLS não emitiu automaticamente dentro da janela normal (~25min); CAA e DNSSEC
  descartados como causa (CAA libera `letsencrypt.org`, sem DNSSEC). Forçado com
  `vercel certs issue <domain>` — emitido em segundos pros dois.
- Após emissão, domínios responderam `DEPLOYMENT_NOT_FOUND` (404) porque não havia alias
  explícito pro deployment de produção mais recente. Corrigido com
  `vercel alias set <deployment> <domain>` pros dois projetos.
- Fly: `fly certs show api.molho.live -a molho-api` → `Issued`, `Certificate is verified
  and active`.

**Checks finais:**
- `curl -I https://app.molho.live/login` → HTTP 200
- `curl -I https://cabanhas-bbq.molho.live/` → HTTP 200
- `curl https://api.molho.live/ready` → HTTP 200, `db=ok`, `redis=ok`

`NG-14` (escopo operacional Cabanhas) verde. `molho.live`/`www` institucional seguem fora
do corte de hoje, sem trabalho adicional. Próximo: Fase 2 (`NG-02` tenant por subdomínio no
domínio final).

## Fase 2 — NG-02 tenant por subdomínio (11/09/2026)

- `cabanhas-bbq.molho.live/` resolve tenant pelo host, sem `/{slug}` na URL pública; CSP
  presente no header.
- `app.molho.live` resolve backoffice (`<title>Molho · Painel</title>`), não vira tenant.
- `api.molho.live` não resolve HTML de tenant (API pura).
- Rota profunda (`/carrinho`) responde.
- **Achado durante a validação, não é bug da app:** tenant inexistente devolve HTTP 200 em
  vez de 404 — bug upstream do Next.js 15.5.24 em `next start` (`notFound()` programático
  não seta status), reproduzido isolado sem depender de middleware/fetch/lógica de tenant.
  Detalhe completo e decisão do PM (não bloqueia o piloto, débito aberto não-bloqueante) em
  `docs/07-aprendizados.md`. Não afeta o Cabanhas real: quando o tenant existir, a página
  certa carrega com 200 correto.

`NG-02` verde para o escopo operacional de hoje. Próximo: Fase 3 (`NG-03` BFF/CORS no
domínio final).

## Fase 3 — NG-03 BFF e CORS (11/09/2026)

- `/api/store/cabanhas-bbq/admin/orders` → 404 `route_not_found` (rejeitado pelo BFF, nunca
  bate no upstream).
- `/api/store/cabanhas-bbq/../platform/tenants` e traversal `%2e%2e` → 404 antes do upstream.
- `/api/store/cabanhas-bbq` (rota pública normal) → 404 `Not Found`/`Loja não encontrada`,
  mas esse é o **upstream real** respondendo (tenant ainda não provisionado, Fase 6) — não é
  rejeição do BFF; confirmado comparando o corpo (`route_not_found` vs `Not Found` da API).
- `Authorization`/`Cookie` enviados pelo browser não voltam ecoados na resposta.
- CORS da API: `Origin: https://app.molho.live` → `access-control-allow-origin` exato;
  origin fora da allowlist → sem header de CORS (bloqueado).

`NG-03` verde para o escopo operacional de hoje. Próximo: Fase 4 (`NG-04` URLs
produtivas/slug).

## Fase 4 — NG-04 URLs produtivas e slug (11/09/2026)

- `pnpm verify:front-release` reutilizado: já verde em `main@1d20f96` (409 artefatos, zero
  endpoint proibido, ver `docs/go-live/evidencias-codex.md`) — é o SHA técnico servindo os
  domínios agora; `ee0276a` (main atual) só adiciona docs em cima dele, sem rebuild
  necessário.
- Spot-check ao vivo em `https://app.molho.live/`: zero ocorrência de
  `api.staging`/`staging-app`/`molho.vercel.app`/`localhost:<porta>` no HTML servido.

`NG-04` verde para o escopo operacional de hoje. Próximo: Fase 5 (`NG-09` CSP/HSTS/headers
finais).

## Fase 5 — NG-09 CSP, HSTS, headers finais (11/09/2026)

- `app.molho.live/login` e `cabanhas-bbq.molho.live/`: CSP em enforcement (sem `https:`,
  `ws:`, `wss:` genérico), R2 allowlisted só onde necessário, `connect-src` do backoffice
  cobre `https://molho-api.fly.dev` (API técnica usada hoje pelo browser; migrar pra
  `api.molho.live` fica registrado como próximo passo, não bloqueia), HSTS ativo,
  `x-frame-options: DENY`, `x-content-type-options: nosniff`,
  `referrer-policy: strict-origin-when-cross-origin`, `permissions-policy` presentes.
- `api.molho.live/ready`: headers defensivos presentes; CSP era report-only genérico
  (esperado, API não serve HTML de produto) e **faltava HSTS** — TLS já validado
  (`fly certs show` → `Issued`/verified), então decisão do PM (11/09/2026): ligar
  `MOLHO_ENABLE_HSTS=true` agora. Aplicado via `fly secrets set MOLHO_ENABLE_HSTS=true -a
  molho-api`, rolling deploy 2/2 máquinas saudáveis, confirmado
  `strict-transport-security: max-age=15552000; includeSubDomains` no `/ready` e API
  continua respondendo `db=ok`/`redis=ok`.

`NG-09` verde para o escopo operacional de hoje. Próximo: Fase 6 (`NG-15` tenant real e dry
run).

## Hotfix — rate limit de OTP 1h → 10min (11/09/2026)

Pedido do PM em produção: janela de 1h (`IP_LIMIT_WINDOW_SECONDS`,
`PHONE_LIMIT_WINDOW_SECONDS` em `apps/api/src/auth/otp/otp.service.ts`)
travava dono/staff/QA por até uma hora a cada retentativa (o rate limiter
registra toda tentativa, até as rejeitadas — ver nota em
`docs/07-aprendizados.md`). Reduzido pra 10min, mesmo teto de requisições
(20/IP, 5/e-mail-telefone). `tsc` limpo, 779/779 testes da API verdes. Deploy
`fly deploy . -c apps/api/fly.prod.toml` (build+context da raiz do monorepo —
rodar de dentro de `apps/api` falha o build multi-stage), imagem
`deployment-01M28PGB9JYPHNJMC02SSPJ1G6`, 2/2 máquinas saudáveis,
`api.molho.live/ready` confirmado (`db=ok`, `redis=ok`).

## PARA O CODEX — handoff: login cai no reload + botões editar/remover somem (11/09/2026)

Dois problemas reais achados pelo PM/operador testando o backoffice em produção,
`app.molho.live`, durante o provisionamento do tenant Cabanhas. Ambos em área
exclusiva do Codex (`apps/backoffice/**`) — CC só fez o hotfix de urgência abaixo
e a correção de env; precisa de olho do Codex pro resto.

### 1. Sessão cai a cada reload — devia durar o turno inteiro

**Esperado (já é o desenho, ver `docs/09b-auth-backoffice.md`):** login uma vez no
início do turno; access token de ~15min renova sozinho via refresh cookie
`__Host-molho_refresh` (`HttpOnly`, 30 dias deslizante, rotação a cada uso);
staff só desloga de verdade no fim do expediente/logout manual ou se a máquina
ficar muito tempo sem uso.

**O que estava quebrado:** `NEXT_PUBLIC_API_URL` do projeto Vercel
`molho-backoffice-prod` apontava pra `https://molho-api.fly.dev` (URL técnica) em
vez de `https://api.molho.live`. O cookie de refresh é `__Host-` (host-only, sem
`Domain`) setado em `api.molho.live` — indo pro domínio `fly.dev`, o browser nunca
manda o cookie, `refreshStaffSession()` (`apps/backoffice/lib/staff-auth.ts:130`)
sempre toma 401 e o `gestor/layout.tsx` redireciona pro `/login` a cada reload.

**CC já corrigiu e reemitiu:** `NEXT_PUBLIC_API_URL=https://api.molho.live` (era
regressão de um hotfix anterior do próprio CC, não bug pré-existente). Redeploy
`dpl_HQWEHrfKvvqH9TayVZEgUxfKpdHP`, READY, alias `app.molho.live` atualizado; CSP
`connect-src` confirmado incluindo `https://api.molho.live`.

**Ainda não verificado ao vivo** (rate limit de OTP durante o teste — "Muitos
pedidos de código, aguarde um pouco"): confirmar no navegador real que um reload
em `/gestor/*` **não** cai mais pro `/login`. Se ainda cair, o próximo suspeito é
CORS/cookie do lado da API (`MOLHO_CORS_ORIGINS`, `SameSite`, ou o endpoint
`/v1/auth/refresh` não aceitando `credentials: include` de `app.molho.live`).

**Pendência de produto, não só bug:** o desenho atual é "sessão dura enquanto o
refresh cookie for usado" (rotação, 30 dias), **sem timeout de inatividade
explícito**. O PM quer logout automático depois de ~1h sem uso (tablet/PC de
balcão compartilhado). Isso não existe hoje — precisa decisão + implementação
(client-side idle timer que chama logout, ou TTL curto no próprio refresh
quando ocioso).

### 2. Preço/badge/botões editar-remover somem inteiros em `/gestor/cardapio`

**Não é o mesmo bug que o CC já corrigiu** (aquele era overflow de coluna reservada
pro painel lateral — corrigido, commit `d4bb364`, confirmado no bundle de produção
via `curl`). Isso é diferente: no navegador real do operador, a linha do item mostra
só ícone+nome+categoria+descrição — nem preço, nem badge "à venda", nem os ícones
lápis/lixeira aparecem, **mesmo depois do hard refresh** e mesmo com o hotfix de
grid já no ar. Testado com zoom in/out e modo responsivo do DevTools, sem efeito.

Não reproduzido pela sessão de automação do CC (lá os botões aparecem normal). Ou
seja: depende de alguma condição do ambiente/sessão real do operador que a
automação não reproduziu — candidatos a investigar:
- erro JS no console do navegador do operador (não coletado ainda — pedir print
  da aba Console);
- alguma extensão de browser do operador escondendo elementos por herurística
  (ad-blocker/privacy);
- diferença de viewport real (a automação testou em ~1400-1980px; conferir a
  resolução real da máquina do operador);
- efeito colateral do próprio bug de sessão acima (se o token expirou no meio do
  carregamento, a lista pode renderizar com dado parcial sem erro visível).

**Reprodução relatada:** `app.molho.live/gestor/cardapio`, item da lista mostra
nome+descrição, mas a faixa à direita (preço, badge, editar, remover) fica em
branco — não sobrepõe, não estoura a tela, simplesmente não renderiza.

**Efeito prático:** operador não consegue excluir nem pausar item nenhum pelo
backoffice hoje. Ficaram 3 itens de exemplo do trial (`X-Salada da casa`, `Batata
crocante`, `Refrigerante lata`) no cardápio do Cabanhas sem conseguir remover.

### 3. Não existe convite de staff/segundo owner no produto

Pedido do PM: `max.buiz@hotmail.com` como segundo owner além de
`superadmin.molho.live@gmail.com`. Não existe fluxo de "convidar equipe" no
backoffice hoje (procurado em `apps/backoffice/app/gestor/**`, nada). O único
endpoint que atribui papel a um e-mail novo num tenant
(`POST /v1/admin/platform/staff`, `apps/api/src/platform/staff-provisioning.controller.ts`)
exige `platform.superadmin` — não é self-service pro dono da loja, é ferramenta
de suporte da plataforma. CC não tem essa credencial e não forçou.

**Sintoma:** `max.buiz@hotmail.com` pede OTP, recebe código, mas
"Código inválido ou expirado" sempre — o e-mail nunca teve conta/vínculo com o
tenant, então não existe verificação real por trás do formulário.

**Resolvido pro piloto de hoje (11/09/2026):** PM pediu caminho real, não login
compartilhado. CC rodou um script one-off (`packages/db/prisma/seed/` local e
descartado depois, nunca commitado) que reproduz exatamente a lógica de
`StaffProvisioningRepository` (mesma função `encryptEmail`/`hashEmailForLookup`
de `@molho/db`, mesmo shape de `AuditLog`) contra o Neon de produção via
`DIRECT_URL`/`app_migrator`: criou `User` pra `max.buiz@hotmail.com` e concedeu
`role=owner, scopeType=tenant, scopeId=<cabanhas-bbq>`. Idempotente (findFirst
antes de create, igual ao código real) — pode rodar de novo sem duplicar.
Auditoria gravada com `actorRole: 'owner'` (ator = `superadmin.molho.live`) e
uma nota explícita no `afterJson` dizendo que foi provisionamento manual por
falta de fluxo self-service.

**Backlog real, não resolvido:** não existe tela de "convidar equipe/segundo
dono" no backoffice, nem um `platform.superadmin` provisionado em produção (o
seed que cria esse papel se recusa a rodar com `NODE_ENV=production` de
propósito — `packages/db/prisma/seed/superadmin.ts:52`). Qualquer próximo
segundo-dono/staff precisa do mesmo contorno manual até o Codex construir o
fluxo de convite de verdade (ou alguém decidir bootstrapar um
`platform.superadmin` de produção pelo fluxo próprio que ainda não existe).

### Ownership

CC mexeu em `apps/backoffice/app/gestor/cardapio/page.tsx` (só o fix de grid,
commit `d4bb364`) e nas env vars do Vercel (`MOLHO_ASSETS_ORIGIN`,
`NEXT_PUBLIC_API_URL`) por urgência de horário — fora do padrão de ownership do
doc 15, registrando aqui pro Codex revisar/assumir dono formal dessas mudanças.

## Hotfix — grid do cardápio espremendo botões editar/remover (11/09/2026)

- Achado durante provisionamento real do tenant: em `app.molho.live/gestor/cardapio`, a
  grid reservava coluna fixa de 420-520px pro painel lateral mesmo com nenhum item
  selecionado, empurrando os botões editar/remover pra fora da área visível em telas
  xl/2xl (confirmado com zoom e modo responsivo do DevTools — não resolveu).
- Fix: `apps/backoffice/app/gestor/cardapio/page.tsx` — a 3ª coluna só entra no
  `grid-template-columns` quando `creatingProduct || selectedProductId` é truthy.
  Commit `d4bb364` em `main`, branch `hotfix/cardapio-grid-overflow` (merge --ff-only).
- Gate: `tsc --noEmit` limpo, `eslint` limpo, `next build` verde, `vitest` 246/246
  (backoffice), incluindo os 23 casos de `cardapio/page.test.tsx`.
- Achado colateral: `MOLHO_ASSETS_ORIGIN` e `NEXT_PUBLIC_API_URL` no projeto
  `molho-backoffice-prod` são variáveis "Sensitive" do Vercel — sempre voltam vazias em
  `vercel env pull`/build local por design (não são um bug; só o build remoto da Vercel
  consegue lê-las). Build local falhou por causa disso; build remoto (`vercel deploy
  --prod` sem `--prebuilt`) resolveu certo.
- Deploy: `vercel deploy --prod` a partir de `apps/backoffice` (build remoto, cache
  Turborepo), deployment `dpl_9BzAfNcnkLUTQ3z4tkizJk6PBPgS`, `status: Ready`, alias
  automático em `app.molho.live` confirmado (`/gestor/cardapio` HTTP 200).
