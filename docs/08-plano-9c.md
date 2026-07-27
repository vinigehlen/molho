# 08 — Plano de execução do Épico 9c (ambiente Fly real)

Infra que destrava a validação de fronteira do Épico 9. **Não é código de feature** —
é o deploy que colapsa metade do checklist de go-live (cookie/CORS same-site, pub/sub
Redis cross-instância, CSP). Ver `CLAUDE.md` → "Infra de produção (decidida no Épico 9)"
pras decisões travadas, e `docs/07` § "Débito técnico ABERTO" pro checklist de fronteira.

## Decisões de escopo (não deixar implícito)

### Este ambiente é STAGING DESCARTÁVEL, não o piloto
O passo 2 roda `db:seed` — o banco nasce com "Hamburgueria da Vila" e pedidos falsos.
**Decisão: o 9c é staging descartável.** O piloto ganha um **projeto Neon próprio, limpo,
provisionado depois** (via o fluxo de onboarding/super-admin dos Épicos 13/14, que é como
tenant real nasce — nunca por seed). Motivo: o seed é exatamente o que se quer em staging
pra validar o board e a fronteira, e assim **nunca** convive com dado de restaurante real —
elimina de vez o risco "esqueci de limpar o seed na véspera". A infra da Fly é reusável
entre staging e prod (só troca `DATABASE_URL`/`DIRECT_URL` nos secrets); só o projeto Neon
difere. **Passo explícito de go-live:** provisionar Neon prod sa-east-1 vazio, apontar os
secrets da Fly pra ele, subir o primeiro tenant pelo onboarding. (Se o PM preferir um único
projeto Neon com limpeza de seed antes do go-live, é a alternativa — mas a decisão default
aqui é staging separado.)

### ZENVIA_API_KEY é secret OBRIGATÓRIO em produção
Corrigido antes do 9c (commit `fix(auth): nega boot em produção sem provider de SMS real`):
sem `ZENVIA_API_KEY` e `NODE_ENV=production`, a API **recusa subir** — não cai mais pro
Mock (que loga o código OTP = bypass de auth). Consequência pro passo 4: `ZENVIA_API_KEY`
é secret obrigatório; sem ele o boot na Fly falha barulhento, de propósito.

## Ordem de execução

### 0. Upstash (Redis) — ANTES de tudo, dono: PM
Confirmar a região do Upstash. Se estiver fora do Brasil, **migrar pra São Paulo junto** —
pub/sub do SSE e refresh token estão no caminho crítico; cross-Atlântico mata latência de
realtime e de auth. **Neon e Redis provisionam em PARALELO**, mas não começar o Neon (passo 1)
antes de o PM confirmar a região do Upstash — ela muda a `REDIS_URL` dos secrets (passo 4) e
a conta de latência da validação cross-instância (passo 7.7).

### 1. Neon `aws-sa-east-1` (projeto NOVO)
Neon não muda região de projeto existente → criar projeto novo em São Paulo. Custo-neutro
(pricing uniforme entre regiões) e barato agora (só schema/migrations/seed, sem dado de prod).
1. `CREATE EXTENSION postgis;` no branch (migrations usam `geography(Point,4326)` — sem isso a `init` falha).
2. Rodar **`packages/db/prisma/bootstrap.sql`** uma vez (cria `app_migrator`/`app_runtime` + ACLs de schema). O `prisma migrate` NÃO faz isso; sem ele a RLS não tem os dois papéis. É o passo que some da memória.
3. Guardar as DUAS connection strings: **pooled** (`-pooler`, PgBouncer transaction) pro runtime, **direta** pras migrations.

### 2. Migração + seed
- `DIRECT_URL` (endpoint direto, session mode) → `prisma migrate deploy` (nunca `migrate dev` liso — trava no SQL à mão, docs/07). Depois `prisma generate`.
- `pnpm db:seed` (valida schema completo + dá dados pro board na validação de fronteira). **Só em staging** (ver decisão de escopo).
- Runtime usa a string **pooled** com `?pgbouncer=true` (desliga prepared statements; o `SET LOCAL app.tenant_id` sobrevive sob transaction pooling porque é escopado à transação). Nunca apontar `DATABASE_URL` de runtime pro endpoint direto.

### 3. Dockerfile + `fly.toml` da `apps/api`
Rascunhos em `apps/api/Dockerfile` e `apps/api/fly.toml` (marcados como DRAFT — não validados contra deploy real).
- Imagem roda **`node dist/main`** (script `start`, que NÃO carrega `.env.local` — env vem dos secrets da Fly, de propósito).
- `fly.toml`: região `gru`, `min_machines_running = 2`, **sem scale-to-zero**, `strategy = "rolling"`, concorrência dimensionada pra **conexão longa** (SSE não é request curta), `kill_timeout` folgado pro drain do SIGTERM.
- Graceful shutdown **já no código** (`enableShutdownHooks()` + `OrderStreamController.onApplicationShutdown()` fecha os streams com `server_shutdown`). **Validar que o SIGTERM da Fly chega e a janela de drain basta.**
- **Mudança de CÓDIGO do 9c:** `max` do pool do adapter `PrismaPg` EXPLÍCITO por instância, dimensionado pra `2 × max` caber no limite de conexão do compute Neon (hoje herda o default 10). Não é config de infra.
- **Health check:** hoje NÃO existe endpoint de health (`/v1/health` dá 404; raiz loga "Épico 2"). Ou usar check TCP na porta, ou adicionar um `/health` leve (pequena mudança de código do 9c).

### 4. Secrets na Fly (`fly secrets set`)
- **Obrigatórios:** `DATABASE_URL` (pooled), `DIRECT_URL` (direto), `REDIS_URL` (Upstash SP — depende do passo 0), `ZENVIA_API_KEY` (**boot falha sem ele em prod**), `MOLHO_ENCRYPTION_KEYS`, segredos de JWT.
- **Opcionais:** `MOLHO_MAX_SMS_PER_DAY` (teto de custo de SMS).
- Nada de secret no repo; `.env.local` nunca vai pro deploy.

### 5. Duas máquinas
- `fly scale count 2 --region gru`. Confirmar **rolling** (Fly derruba uma por vez; a outra segura os streams). Máquina única mataria 100% dos SSE juntos a cada deploy — é o motivo de existirem duas.
- **A MEDIR no piloto (YAGNI, só instrumentar):** distribuição das conexões SSE após rolling deploy, teto de conexões/máquina. Sem cap construído.

### 6. DNS + TLS (`molho.live`) — TRAVA no registro do domínio (dono: PM)
- `api.molho.live` → Fly (`fly certs add`, A/AAAA do app). TLS no edge com HTTP/2 (ALPN `h2`) — resolve o teto de ~6 conexões/domínio do HTTP/1.1 no browser.
- `app.molho.live` → Vercel (backoffice). `*.molho.live` → Vercel (storefronts) + TLS wildcard.
- `app.` e `api.` sob o mesmo registrable domain = **same-site** — é o que faz o cookie de stream funcionar (a fronteira que NÃO é validável em dev, docs/07).
- **Mudanças de CÓDIGO do 9c:**
  - CORS de produção na `apps/api` (`main.ts`): allowlist **exata** `https://app.molho.live` + `Allow-Credentials: true`, nunca curinga nem eco do `Origin`. Hoje o CORS é de dev (localhost).
  - **`X-Content-Type-Options: nosniff`** — o docs/07 dizia que entraria no Épico 9, mas **NÃO entrou** (confirmado: nenhum `headers()` em nenhum `next.config.ts`, nenhum nosniff no código). **Entra aqui**, risco zero. (CSP completa segue sendo item PM separado, pré-go-live — não neste passo.)

### 7. Checklist de validação de fronteira (condição de go-live — docs/07 §ABERTO)
Só verificável contra os domínios reais na Fly. Ordem:
1. `EventSource` de `app.molho.live` → `api.molho.live/.../stream` **conecta** com `withCredentials` (cookie `__Host-molho_stream` cross-origin same-site).
2. A mesma conexão de origem fora da allowlist (`{slug}.molho.live` ou `*.vercel.app`) é **bloqueada pelo CORS**.
3. CORS responde `Access-Control-Allow-Origin: https://app.molho.live` **exato** + `Allow-Credentials: true`.
4. Cookie no DevTools de prod: `__Host-` + `HttpOnly; Secure; SameSite=Strict; Path=/` **sem `Domain`**.
5. `token_expired` com stream aberto → servidor fecha limpo → cliente reabre; refresh negado → login. *(fluxo completo depende do 9b; o fecha-limpo do servidor é testável já.)*
6. Preview Vercel (`*.vercel.app`) → SSE não autentica (cross-site) e o front **degrada pra polling**.
7. **★ pub/sub Redis cross-instância** — o ÚNICO mecanismo do Épico 9 que **ninguém nunca viu rodar**: publicar numa máquina, confirmar que a aba conectada na OUTRA máquina recebe o cutuque. Só existe com duas máquinas + Upstash real. **Priorizar.** (Em dev validou-se só single-instance in-memory: 2 abas, 1 API.)
8. `disarm` no logout apaga o cookie em `api.molho.live` (wiring depende do 9b; o endpoint já existe).

## Pré-requisitos do PM (caminho crítico)
- **Região do Upstash** → passo 0, `REDIS_URL` (passo 4), validação cross-instância (7.7).
- **Registro do `molho.live`** → passos 6 e 7 inteiros (DNS, TLS, fronteira same-site).

Sem os dois: dá pra fazer passos 1–3 (Neon staging + migração + seed, DEPOIS do OK do Upstash) e os rascunhos de Dockerfile/`fly.toml`. Nada de 6–7 até o domínio registrado.
