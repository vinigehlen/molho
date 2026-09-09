# Contratos de integração — trilha CC (proposta para congelamento)

Proposta da trilha CC para a seção 4 do `docs/15-divisao-zero-no-go-codex-cc.md`. Codex
revisa e congela junto com os contratos de BFF/API e Domínios. Nada de código muda antes
do congelamento (regra da Onda 0).

Cobre: **Banco** (`NG-10`, `NG-05`), **Impressão** (`NG-06`), **matriz de variáveis
backend/infra** (`NG-05`). Inclui decisões de escopo de piloto que alteram critérios do
doc 14 — marcadas **[decisão PM]**.

---

## 1. Banco (Neon)

- Projeto produtivo novo e isolado: `molho-prod`, região `AWS South America East 1
  (São Paulo)` — mesma região do Neon de staging e co-localizado com a Fly `gru`.
- **`DATABASE_URL`**: string **pooled** (`-pooler`, `sslmode=require`), role **`app_runtime`**
  (LOGIN, sem CREATE, sujeito a RLS). Usada por API e workers. Runtime nunca migra.
- **`DIRECT_URL`**: string **direta** (sem pooler), role **`app_migrator`** (LOGIN CREATEDB,
  dono das tabelas). Usada **somente** pelo job de migration, nunca carregada no runtime
  normal da API.
- `NEON_ADMIN_URL` (role owner do Neon): só para rodar `bootstrap.sql` e depurar roles.
  Fora de runtime e de migration.
- Bootstrap: `packages/db/prisma/bootstrap.sql` roda uma vez como owner (cria roles,
  instala PostGIS, GRANTs de schema). Senhas das roles setadas fora do arquivo, nunca
  commitadas.
- Migration: `prisma migrate deploy` em runner seguro (sem segredo em linha de comando).
  Somente migrations **expansivas** nesta janela; proibido `prisma migrate dev` liso,
  `migrate dev` sem `--create-only`, down migration destrutiva, seed do Cabanhas e cópia
  de staging.
- RLS fail-closed em toda tabela com `tenant_id`; `users`/`user_roles` globais sem RLS.
  Auditoria de ownership de tabelas e de todas as políticas após o deploy.
- Branch produtiva protegida — **indisponível no Free** (1 branch protegida/org, staging usa).
  Fica desprotegida no piloto; reavaliar ao trocar de plano.
- **Restauração — [decisão PM 2026-09-09, ata NG-01 §1.5]:** plano **Free** + `pg_dump`
  noturno comprimido para o bucket R2 (`s3://molho-backups/`), retenção de 30 dias, via
  cron. Aceito: cold start após ocioso (primeiro pedido depois de parado pode falhar/
  atrasar; cliente refaz), history de restore ~6h.
  - RPO declarado: até 24h (último dump). RTO: restore manual para branch nova, ~30 min,
    procedimento em `plantao.md`.
- Shadow DB (`NEONDB_SHADOW_URL`, só para criar migration nova): reusar o de staging ou
  uma branch descartável com PostGIS — não é recurso de produção.

## 2. Impressão (agente ESC/POS)

Modelo detalhado em `docs/go-live/evidencias-cc.md` § C0.3. Contrato a congelar:

- **Tabela nova `print_devices`** (tenant-scoped, RLS, uuid v7, soft delete, auditoria).
  Migration expansiva; não toca em `print_jobs`.
- **Credencial de dispositivo**, não token de staff:
  - segredo formato `molho_pd_<base32>`, exibido **uma vez** no pareamento, persistido só
    como `token_hash` + `token_prefix`;
  - escopo fixo `printing` — sem autorização por role;
  - `version` para rotação; `revoked_at` para revogação (efeito imediato, não afeta
    sessão de staff).
- **Rotas do agente:** namespace dedicado **`/v1/printing/agent/*`** (`claim`, `printed`,
  `failed`), fora de `/v1/admin/*`. Guard novo `PrintDeviceAuthGuard`
  (`Authorization: Bearer molho_pd_...` + `x-tenant-id`), `@RequireModule('printing.escpos')`
  continua valendo.
- **Rotas de gestão (staff):** `/v1/admin/printing/devices` (criar / listar / rotacionar /
  revogar), `JwtAuthGuard` + `@RequireModule('printing.escpos')` +
  `@RequirePermission('team.manage')`.
- **[decisão PM 2026-09-09, ata NG-01 §1.7]** reusar a permissão **`team.manage`** (já
  existe, `owner`/`manager`). Sem permissão nova, sem tocar o contrato compartilhado
  `packages/contracts`. Reavaliar `printing.device.manage` dedicada pós-piloto se a
  imprecisão incomodar.
- **Agente (`apps/print-agent`):** `MOLHO_PRINT_DEVICE_TOKEN` (obrigatório) substitui
  `MOLHO_STAFF_ACCESS_TOKEN`; `MOLHO_API_URL` obrigatória, sem default de staging;
  estado "credencial revogada" acionável; reconexão com backoff; idempotência de reimpressão
  no restart (o 409 de optimistic lock já é tratado como "concluído por outro").
- Ordem de implementação: contratos → Prisma/migration → API → agente → UI de pareamento →
  testes.

## 3. Matriz de variáveis — backend/infra (nomes, sem valores)

Fonte: `.env.example`. Coluna "prod" = valor exigido no `molho-api` produtivo.

| Variável | Origem | Regra em produção |
|---|---|---|
| `NODE_ENV` | Fly `[env]` | `production` |
| `PORT` | Fly `[env]` | `3333` |
| `DATABASE_URL` | Fly secret | pooled, role `app_runtime`, host Neon `sa-east-1`; boot rejeita se contiver `staging`/`localhost`/`vercel.app` ou não for pooled |
| `DIRECT_URL` | migration job | direta, role `app_migrator`; **não** presente no runtime da API |
| `REDIS_URL` | Fly secret | `rediss://` (TLS) Upstash São Paulo; obrigatório — sem ele o boot falha (hoje cai pra memória) |
| `S3_ENDPOINT` `S3_REGION` `S3_BUCKET` `S3_ACCESS_KEY_ID` `S3_SECRET_ACCESS_KEY` | Fly secret | obrigatórios; boot rejeita `MockStorageProvider` em produção |
| `S3_PUBLIC_URL` | Fly secret | **[decisão PM 2026-09-09, ata NG-01 §1.6]** `https://pub-<hash>.r2.dev` no piloto (registrable domain isolado, satisfaz a regra de origem separada de `docs/07`); domínio de assets próprio fica pós-piloto. Flexibiliza o `NG-13` original (domínio próprio) |
| `MOLHO_ENCRYPTION_KEYS` | Fly secret | mapa versão→chave 32B base64; obrigatório |
| `MOLHO_OTP_HMAC_KEY` | Fly secret | 32B base64; obrigatório (boot já falha sem) |
| `MOLHO_EMAIL_PEPPER` | Fly secret | 32B base64; obrigatório (app lança sem) |
| `MOLHO_JWT_SECRETS` | Fly secret | mapa versão→chave; obrigatório (boot já falha sem) |
| `OTP_CHANNEL_STAFF` `OTP_CHANNEL_CUSTOMER` | Fly `[env]`/secret | `email` no piloto |
| `RESEND_API_KEY` `MOLHO_EMAIL_FROM` | Fly secret | obrigatórios (canal OTP = email; boot já falha sem) |
| `ZENVIA_API_KEY` | — | ausente no piloto (SMS desligado); reativar = trocar `OTP_CHANNEL_*` |
| `MOLHO_CORS_ORIGINS` | Fly secret | exatamente `https://app.molho.live` |
| `MOLHO_API_INTERNAL_URL` | Vercel (storefront) | URL técnica HTTPS da Fly no RC; nunca `NEXT_PUBLIC_` |
| `MOLHO_DEBUG_PUBSUB` | — | ausente / falso (boot valida) |
| `SENTRY_DSN` | Fly secret | obrigatório; projeto `molho-api`, environment `production`, release = git SHA |
| `MOLHO_PRINT_DEVICE_TOKEN` | env do agente (PC da loja) | obrigatório; substitui `MOLHO_STAFF_ACCESS_TOKEN` |
| `MOLHO_API_URL` | env do agente | `https://api.molho.live` (ou URL técnica no RC); sem default de staging |

**Novas variáveis a introduzir (`NG-05`/`NG-06`):** `MOLHO_PRINT_DEVICE_TOKEN` (agente).
Todo o resto já existe no `.env.example`; a mudança de `NG-05` é **passar a exigir/validar**
no boot, não criar nome novo.

## 4. Decisões PM — resolvidas na ata NG-01 (2026-09-09)

- [x] plano Neon: **Free** + `pg_dump` noturno 30 dias (§ 1);
- [x] assets no piloto: **`r2.dev` público** (§ 3, `S3_PUBLIC_URL`);
- [x] permissão de impressão: **reusar `team.manage`** (§ 2);
- [ ] operador Cabanhas nomeado (contato) para o `plantao.md` — segue pendente (`NG-15`).

Contratos prontos para o Codex congelar (doc 15 §4). Ver `docs/go-live/ata-ng-01.md`.
