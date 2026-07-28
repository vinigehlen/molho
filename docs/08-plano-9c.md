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

**Decisão (Épico 9c): o staging São Paulo VIRA o dev-local; o `molho` (US East) é aposentado ao fechar o 9c.**
O staging (`wild-pine-22057676`, sa-east-1) é co-locado, mesmo schema, mesmo seed, e é contra ele
que validamos — então passa a ser o **dev-local** (a `.env.local` já aponta pra ele, com o mapeamento
`app_runtime`/`app_migrator`). O projeto antigo `molho` (`floral-dream-56687978`, us-east-1) fica
**intocado como rede de segurança até o 9c fechar, e então é APOSENTADO** — os dois projetos dividem
a cota do Free plan do Neon, então manter o US East vivo custa. **Não** reconstituir o `.env.local` do
US East (rotacionar senha + montar arquivo é trabalho pra um ambiente que já tem data de aposentadoria);
se algum dia precisar dele antes de aposentar, as roles `app_runtime`/`app_migrator` ainda existem lá
(senhas não salvas → rotacionar via `ALTER ROLE` e remontar). O piloto continua ganhando projeto Neon
próprio e limpo (decisão acima), independente disso.

**Consequência da decisão (não deixar implícito):** a validação de fronteira do passo 7 roda
contra **staging** (`staging-app`/`staging-api`), mas o piloto será um **provisionamento
diferente** — projeto Neon novo, secrets novos, certs novos, domínios de produção. **O DESENHO
transfere (mesmo código, mesmo fluxo de cookie/CORS/pub-sub); o PROVISIONAMENTO não.** Passar em
staging prova o desenho, não a config de produção. Por isso o go-live exige um **passe de fumaça
de produção** (§7b) — o subset do checklist que depende de CONFIG, não de desenho.

### ZENVIA_API_KEY é DEPENDÊNCIA DURA do 9c inteiro (não só do boot)
Corrigido antes do 9c (commit `fix(auth): nega boot em produção sem provider de SMS real`):
sem `ZENVIA_API_KEY` e `NODE_ENV=production`, a API **recusa subir** — não cai mais pro
Mock (que loga o código OTP = bypass de auth).

**Mas a dependência é maior que o boot — ela trava TODA a validação de fronteira (§7).**
Cadeia: validar a fronteira exige um `EventSource` conectado → o cookie de stream vem do
`POST /stream/arm` → `arm` exige **JWT de staff** → o JWT vem do **OTP** → o OTP precisa de
**SMS**. E o stub `dev-login` é **eliminado do bundle de produção por desenho** (docs/07 + a
checagem de CI). Logo, **sem chave ZENVIA não há como obter sessão de staff no ambiente
deployado, e NENHUM item do checklist de fronteira roda** — nem cookie `__Host-`, nem CORS,
nem o pub/sub cross-instância (que precisa de um stream conectado pra ser observado). É
pré-requisito de tudo em 6–7, não um detalhe do passo 4.

**Opção (b) — `NODE_ENV=staging` pra liberar o Mock — está VETADA.** Além do OTP burlável num
`api.` público (bypass de login), `staging` **não é valor padrão do Node**: bibliotecas tratam
qualquer coisa `!== 'production'` como desenvolvimento. Seria pôr o **stack inteiro em modo dev
num host público**, não só liberar o mock. Só (a): chave ZENVIA real (mesmo de teste/sandbox).

**Levantamento (Épico 9c) — o sandbox Zenvia NÃO tem lead time (não é classe PSP):**
- **Sandbox Zenvia: self-service, grátis, sem contrato, sem CNPJ pra criar a conta** — valida só
  email + telefone, aprovação **instantânea**. O Access Token do sandbox fica em **Developers →
  Tokens and Webhooks**. Limite **200 msgs/dia** (sobra pro staging).
- **Requisito operacional:** número que RECEBE precisa de **opt-in** (registrar como contato +
  enviar uma keyword pro contato Zenvia). Ou seja, os telefones de staff usados no login de staging
  precisam ser cadastrados no sandbox. Poucos números — tranquilo.
- **Conclusão: dá pra ter a chave HOJE.** Sai do caminho crítico de calendário (≠ PSP recorrente
  do 13d, que tem CNPJ/contrato/underwriting). A chave de sandbox destrava toda a validação 6–7.
- **Alternativas (Twilio, AWS SNS):** mais fricção pra SMS no Brasil (registro de sender/long code,
  aprovação regulatória) que o sandbox Zenvia — e trocariam o provider no código (NÃO fazer). O
  sandbox Zenvia é o caminho mais rápido E já está no código (`ZenviaSmsProvider`).
- **Produção (conta PAGA) — DEPENDÊNCIA DE CALENDÁRIO DO GO-LIVE, iniciar EM PARALELO (não quando
  chegar lá).** O sandbox cobre o 9c inteiro, mas o go-live precisa de SMS real (sem opt-in por
  número). A conta paga exige: **validação de CNPJ**, **contrato** (prazo indeterminado, cobrança por
  **boleto** no 5º dia útil do mês seguinte ao uso), e escolha de plano em
  `zenvia.com/produtos/messaging/sms`. É **mais leve que o PSP** do 13d (sem KYC/underwriting), mas
  **não é instantâneo** como o sandbox — validação de CNPJ + contrato têm calendário. Mesma classe de
  ação do PSP: abrir já, em paralelo com os épicos, não no go-live.
  - **⚠️ NÃO CONFIRMADO (hipótese, não fato):** que o opt-in por número seja regra só de SMS
    **marketing** e que **OTP transacional** seja exceção. **Confirmar no cadastro do plano pago
    ANTES de assumir.** Se estiver ERRADO (opt-in exigido também pra OTP), muda o onboarding de TODO
    lojista — cada cliente final teria que dar opt-in antes de receber o código, o que quebra o
    fluxo de checkout. É premissa de produto, não detalhe de infra.

### Pré-requisito da validação de fronteira: owner do seed com telefone REAL (opt-in do sandbox)
O opt-in do sandbox Zenvia (o número que RECEBE precisa se cadastrar + enviar keyword) tem
consequência no seed: o owner usa `+5551999990000` (fictício), que **nunca recebe o SMS** → sem OTP
→ sem JWT de staff → **nenhum item de 6–7 roda**. O staging precisa de um owner com um número **REAL
que o PM controle e faça opt-in no sandbox** — mas esse número **não pode ir hardcoded no repo**.

Duas formas:
- **(a) env var `MOLHO_SEED_STAFF_PHONE` lida pelo seed, fallback pro fictício.** O seed sobrescreve o
  `owner.phone` do 1º tenant com a env se ela existir. **Trade-off:** mínimo (o seed já lê env —
  encryption keys etc.); o número real vive só no `.env.local` do staging (gitignored, fora do repo);
  o fallback mantém CI/dev determinístico. Contra: o seed passa a depender de 1 env opcional.
- **(b) script separado que promove um número a staff no staging.** **Trade-off:** roda depois do seed,
  cria `user` + `user_role('owner')` pro número. Contra: mais peça móvel, DUPLICA a lógica que o
  onboarding (Épico 13) já tem, e vira segunda fonte de verdade pra "quem é staff".

**Recomendação: (a) — IMPLEMENTADA.** O seed lê `MOLHO_SEED_STAFF_PHONE` e sobrescreve o `owner.phone`
do 1º tenant (hamburgueria-da-vila) se a env existir; ausente = fictício. Passa pela MESMA cifragem
dos demais (`encryptPhone`/`hashPhoneForLookup`, sem formato divergente). Valida E.164 BR (`+55…`) e
**RECUSA rodar com `NODE_ENV=production`** (falha barulhenta — o seed sobrescreveria contato de lojista
real; piloto nasce por onboarding, não por seed). Doc no `.env.example`.
**PRÉ-REQUISITO OPERACIONAL de 6–7:** fazer **opt-in desse número no sandbox Zenvia ANTES do 1º login**
de staff no staging — senão o SMS do OTP não chega e a cadeia inteira (JWT→arm→cookie→stream) não sobe.

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
1. `CREATE EXTENSION postgis;` no branch (migrations usam `geography(Point,4326)` — sem isso a `init` falha). (O `bootstrap.sql` do passo 2 já faz isso; explícito aqui por garantia.)
2. Rodar **`packages/db/prisma/bootstrap.sql`** uma vez, conectado como `neondb_owner` (cria `app_migrator`/`app_runtime` + postgis + ACLs de schema). O `prisma migrate` NÃO faz isso; sem ele a RLS não tem os dois papéis. É o passo que some da memória.
3. **REMAPEAR OS ROLES antes de qualquer migration — passo obrigatório, não opcional (ver `docs/03` §9).** As strings que o console do Neon entrega vêm com **`neondb_owner`**, que **NÃO serve**: migration falha (`permission denied to change default privileges` — a migration roda como `app_migrator`) e RLS fica bypassada (dono ignora policy → fail-closed passa FALSO). Setar senha nos dois roles (`ALTER ROLE app_migrator/app_runtime PASSWORD ...`) e montar as strings finais:
   - **`DATABASE_URL` → `app_runtime`** na string **pooled** (`-pooler`, PgBouncer transaction, `pgbouncer=true`) — runtime sujeito a RLS.
   - **`DIRECT_URL` → `app_migrator`** na string **direta** — migrations/seed, dono do schema.
   - `neondb_owner` some das duas strings (só rodou o bootstrap). Verificar: tabelas de `public` com dono `app_migrator`, e query como `app_runtime` sem GUC retorna 0 (fail-closed). **Isto vale pro projeto do PILOTO também** — todo projeto Neon novo nasce com neondb_owner e precisa deste remapeamento.

### 2. Migração + seed
- `DIRECT_URL` (endpoint direto, session mode) → `prisma migrate deploy` (nunca `migrate dev` liso — trava no SQL à mão, docs/07). Depois `prisma generate`.
- `pnpm db:seed` (valida schema completo + dá dados pro board na validação de fronteira). **Só em staging** (ver decisão de escopo).
- Runtime usa a string **pooled** com `?pgbouncer=true` (desliga prepared statements; o `SET LOCAL app.tenant_id` sobrevive sob transaction pooling porque é escopado à transação). Nunca apontar `DATABASE_URL` de runtime pro endpoint direto.

### 3. Dockerfile + `fly.toml` da `apps/api`
`apps/api/Dockerfile` e `apps/api/fly.toml` — **build e boot validados localmente** (imagem sobe, Prisma carrega, guard do ZENVIA dispara). Dois erros pegos e corrigidos antes de qualquer `fly deploy`: `pnpm deploy` precisa de `--legacy` (pnpm v10+), e Prisma precisa de `openssl`/`ca-certificates` no builder E runner (senão "Defaulting to openssl-1.1.x" no slim).
- Imagem roda **`node dist/main`** (script `start`, que NÃO carrega `.env.local` — env vem dos secrets da Fly, de propósito).
- **Tamanho:** multi-stage já certo — runner só tem `dist` (2,4MB) + node_modules de prod (402MB, dominado por NestJS+Prisma) + engines Prisma (22MB); sem toolchain. Base `node:22-slim` (~150MB, node binário 120MB). **Imagem amd64 ≈ 175MB comprimida (pull) / ~550MB descomprimida.** (Os 883MB do 1º build foram artefato do buildx local no Mac arm64 com multi-arch+attestations — a Fly builda amd64 nativo, sem esse inchaço; pra reproduzir o tamanho real localmente: `--platform linux/amd64 --provenance=false --sbom=false`.) **Não vale trocar pra alpine/musl** — arriscaria o engine do Prisma validado por um ganho de base; a redução segura já está feita.
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

#### Armadilha da Cloudflare: proxy (nuvem laranja) NA FRENTE do SSE — CONFIRMADA
O `molho.live` está registrado e o DNS é gerido na Cloudflare. **`api.molho.live` NUNCA pode
ficar com o proxy da Cloudflare ligado (nuvem LARANJA) — tem que ser DNS-only (nuvem CINZA).**
Três motivos, todos fatais pro Épico 9:
1. **Buffer de streaming:** o proxy da Cloudflare BUFFERIZA a resposta — o SSE deixa de ser
   incremental, os cutuques não chegam em tempo real (ou chegam em lote).
2. **Timeout de conexão longa:** o proxy corta conexão ociosa (~100s), brigando com o keepalive
   de 25s do stream e a natureza de vida longa do SSE.
3. **TLS terminado na Cloudflare, não na Fly:** move a fronteira que o desenho depende — o cookie
   `__Host-`/same-site foi desenhado pra TLS terminando na Fly (`api.molho.live` host-only, HTTP/2
   ALPN `h2`). Proxy laranja re-termina o TLS e pode reescrever/mexer no fluxo.
   → `api.` **DNS-only**: A/AAAA (ou CNAME) apontando direto pra Fly; a Fly termina o TLS.
Para `app.` e `*.` (Vercel): também **DNS-only** — Vercel gerencia o próprio edge/TLS, e proxy da
Cloudflare na frente do Vercel é fonte conhecida de loop de redirect / handshake TLS duplo.

#### O que precisa de você no painel de DNS da Cloudflare
**Pode fazer AGORA (Vercel — não depende da Fly):**
- `app.molho.live` → adicionar o domínio no projeto Vercel do **backoffice**; criar o registro que a
  Vercel indicar (CNAME `cname.vercel-dns.com` ou A/AAAA), **nuvem CINZA (DNS-only)**.
- `*.molho.live` → adicionar domínio wildcard no projeto Vercel do **storefront** (Vercel emite TLS
  wildcard); registro CNAME wildcard que a Vercel indicar, **DNS-only**.
- (opcional) raiz `molho.live` → redirect pro `app.` ou landing — decidir depois, não bloqueia.

**ESPERA o app da Fly existir (passo 3/5):**
- `api.molho.live` → só depois do app na Fly (pra ter os IPs/target). Aí: registro A/AAAA (ou CNAME)
  pro app da Fly, **nuvem CINZA (DNS-only)**, e `fly certs add api.molho.live` pra TLS na Fly.

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

### 7b. Passe de fumaça de PRODUÇÃO (condição de go-live)
O passo 7 roda contra staging e prova o DESENHO. Como o piloto é provisionamento diferente
(Neon/secrets/certs/domínios novos — ver decisão de escopo), o go-live exige re-verificar o
que depende de **config de produção**, não de desenho. Subset curto e obrigatório, contra
`app.molho.live`/`api.molho.live` reais:

1. **Cookie `__Host-` no domínio de produção** — inspecionar no DevTools de prod que o
   `__Host-molho_stream` chega com `HttpOnly; Secure; SameSite=Strict; Path=/` e **sem `Domain`**
   (host-only em `api.molho.live`). É config de cookie/TLS/domínio, não código — pode passar em
   staging e falhar em prod se um cert, um domínio ou um proxy estiver diferente.
2. **CORS à origem exata de produção** — `Access-Control-Allow-Origin: https://app.molho.live`
   **exato** + `Allow-Credentials: true`; e uma origem fora da allowlist bloqueada. A allowlist
   é config por ambiente (staging aponta pra `staging-app`); a de prod precisa ser verificada
   contra o domínio de prod, não presumida do staging.
3. **pub/sub Redis cross-instância entre as DUAS máquinas de produção** — publicar numa máquina,
   confirmar que a aba conectada na OUTRA recebe o cutuque. Depende do `REDIS_URL` de prod e de
   haver de fato duas máquinas no `gru` de prod — config, não desenho (o desenho é o §7.7 do
   staging). É o item de maior risco: nunca rodou em lugar nenhum até o staging, e o Upstash de
   prod pode ser instância/região diferente da de staging.

Os outros 5 itens do §7 (fluxo de token, degradação de preview, disarm) são majoritariamente
DESENHO e ficam cobertos pelo staging — só re-verificar em prod se algum tocar config nova.

## Pré-requisitos do PM (caminho crítico)
- **Região do Upstash** → passo 0, `REDIS_URL` (passo 4), validação cross-instância (7.7).
- **Registro do `molho.live`** → passos 6 e 7 inteiros (DNS, TLS, fronteira same-site).

Sem os dois: dá pra fazer passos 1–3 (Neon staging + migração + seed, DEPOIS do OK do Upstash) e os rascunhos de Dockerfile/`fly.toml`. Nada de 6–7 até o domínio registrado.
