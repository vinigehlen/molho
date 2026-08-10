# 08 — Plano de execução do Épico 9c (ambiente Fly real)

Infra que destrava a validação de fronteira do Épico 9. **Não é código de feature** —
é o deploy que colapsa metade do checklist de go-live (cookie/CORS same-site, pub/sub
Redis cross-instância, CSP). Ver `CLAUDE.md` → "Infra de produção (decidida no Épico 9)"
pras decisões travadas, e `docs/07` § "Débito técnico ABERTO" pro checklist de fronteira.

## ESTADO ATUAL DO STAGING (2026-08-04) — ler antes dos passos

Fonte única do que já está de pé. Os passos da "Ordem de execução" abaixo continuam válidos
como desenho; este bloco diz onde a execução parou.

> **`molho-api-staging` está NO AR** — 1 máquina em `gru`, `https://api.staging.molho.live/health`
> responde **HTTP 200**. Não há bloqueio de boot. Próximo movimento: escalar pra 2 e provar o
> ★ pub/sub cross-instância (§7.7).

**Feito:**
- **Invólucro de build: RESOLVIDO — o deploy da raiz builda e sobe.** Comando final:
  ```
  fly deploy . -c apps/api/fly.toml --ha=false
  ```
  O Dockerfile é multi-stage de workspace (`COPY pnpm-workspace.yaml`, `packages/db`,
  `packages/contracts`) e o Docker proíbe sair do context (`../..`) — então a correção é a
  **invocação**: em `fly deploy [WORKING_DIRECTORY]` o argumento posicional É o build context
  (`-c` só aponta o TOML, não move o context). Correções da mesma unidade:
  `[[http_service.checks]]` em `/health` (endpoint já existe — ver passo 3),
  `[[services.tcp_checks]]` órfão **removido** (em TOML ele criava um `[[services]]` implícito
  sem `internal_port` — origem do warning "service must expose a port"), e o comentário do
  `NODE_ENV` corrigido (ver passo 4).
  - **Correção final (a que destravou):** `[build] dockerfile` estava `"apps/api/Dockerfile"`,
    mas **a Fly resolve esse caminho relativo AO TOML** (que vive em `apps/api/`) — virava
    `apps/api/apps/api/Dockerfile`. Valor certo: `"Dockerfile"` liso. ⚠ **`dockerfile` e build
    context têm bases DIFERENTES**: o primeiro é relativo ao TOML, o segundo é o argumento
    posicional (a raiz). O comentário do `[build]` que dizia "relativo à raiz do monorepo" era
    **falso** e **já foi corrigido** no `fly.toml` (não é mais pendência).
- **App bootou na Fly pela 1ª vez (2026-08-03):** imagem no registry (132MB), Nest inicia,
  `MessagingModule`/`StorageModule` em **Mock** (canal `email`, sem Zenvia/S3 — esperado), 11
  secrets aplicados. Um crash-loop de `MOLHO_JWT_SECRETS` seguiu-se e foi **resolvido** (abaixo).
- **`MOLHO_JWT_SECRETS`: RESOLVIDO (2026-08-04).** O crash-loop no boot era **placeholder
  não-JSON** no secret — `loadJwtSecrets` (`auth/token/token-payload.ts`) faz `JSON.parse` no
  carregamento do módulo. O formato é **objeto JSON versionado** `{"1":"<32 bytes base64>"}`
  (mesmo padrão de `MOLHO_ENCRYPTION_KEYS`/`MOLHO_OTP_HMAC_KEY`; ver `.env.example`). Re-setado
  com JSON válido via `fly secrets set` — **aspas simples por fora no shell** pra proteger as
  aspas duplas do JSON, e **sem `--stage`** (aplica e redeploya na hora). **Não era bug de código.**
- **APP VIVO (2026-08-04):** 1 máquina, boot limpo — `Nest application successfully started` +
  `Molho API no ar em …:3333` —, health check em `/health` porta 3333 **PASSING**,
  `curl https://api.staging.molho.live/health` → **HTTP 200**.
  - **Todas as rotas mapeadas** no boot: `auth/otp` (staff **e** customer), sessions, catálogo,
    checkout, e o **SSE `orders/stream`**. Ou seja, o wiring do Épico 9 subiu inteiro no ambiente
    real — o que falta pra exercitá-lo é sessão de staff (gate do Resend) e a 2ª máquina.
  - **Headers de segurança ativos** na resposta: `X-Content-Type-Options: nosniff`,
    `X-Frame-Options: DENY`, e ACAO com credentials (passo 6 parcialmente entregue — falta só a
    verificação de allowlist/origem do §7.2–7.3).
- **Estado de configuração do app no ar:** OTP em **e-mail**; `MessagingProvider` e
  `StorageProvider` em **Mock** (`ZENVIA_API_KEY` e `S3_ACCESS_KEY_ID` ausentes — **esperado**,
  a guarda é por canal em uso). Se for testar upload, o R2/S3 vira secret. **Uma máquina só**
  (`--ha=false` no deploy).
- **12 secrets staged** em `molho-api-staging`: `DATABASE_URL`, `DIRECT_URL`,
  `MOLHO_ENCRYPTION_KEYS`, `MOLHO_OTP_HMAC_KEY`, `REDIS_URL`, `OTP_CHANNEL_STAFF=email`,
  `OTP_CHANNEL_CUSTOMER=email`, `MOLHO_EMAIL_FROM`, `MOLHO_EMAIL_PEPPER`, `RESEND_API_KEY`,
  `MOLHO_JWT_SECRETS`, `MOLHO_CORS_ORIGINS=https://staging.molho.live`.
  Staged materializa no próximo `fly deploy` — não precisa de `fly secrets deploy` separado.
  **No deploy de 2026-08-03 a máquina reportou 11 secrets** (conferir a diferença ao re-setar o
  `MOLHO_JWT_SECRETS`; `fly secrets list` mostra os nomes).
- **DNS do staging pronto e CINZA (DNS-only) na Cloudflare** — `staging.molho.live` (CNAME
  Vercel, backoffice) e `api.staging.molho.live` (A/AAAA Fly, cert Let's Encrypt **Issued**).
  `molho.live` fica **reservado pro piloto**. ⚠ Nomenclatura final é
  `staging.` / `api.staging.`, **não** o `staging-app`/`staging-api` que aparece no resto deste
  doc e no comentário do `fly.toml` — os dois pares são same-site sob `molho.live` do mesmo jeito,
  mas ao ler o §7 traduza os nomes.

**PRÓXIMO BLOCO — não feito, PRECISA DE PLANO ANTES:** `fly scale count 2 --region gru`, que é o
**1º teste do ★ pub/sub Redis cross-instância** (`/v1/admin/orders/stream`, §7.7 — o único
mecanismo do Épico 9 que ninguém nunca viu rodar). **Não é "subir 2 e torcer".** O experimento
tem que ser desenhado: abrir **duas conexões SSE em máquinas DISTINTAS** (a Fly balanceia sozinha
— não presumir, **confirmar em qual máquina cada conexão caiu**), publicar um evento numa e
**provar de propósito** que a aba da OUTRA recebe o cutuque. Sem isolar a máquina de cada conexão,
um verde não distingue fan-out cross-instância de duas conexões na mesma máquina — seria o pior
resultado possível: falso positivo no item de maior risco do épico. Depende da cadeia
OTP→JWT→`arm` funcionando, logo do gate do Resend abaixo.

**Pendências registradas (não bloqueiam o §7.7):**
- **Cap por IP in-app no request de OTP — ANTES do piloto.** O IP público da Fly **já está
  tomando scan de bots**, e a nuvem CINZA (DNS-only, exigida pelo SSE — §6) significa **sem WAF
  da Cloudflare na frente**: a única defesa é in-app. O `OtpService` já tem sliding window de
  20/hora por IP (CLAUDE.md § Segurança) — a pendência é **verificar que ela cobre a superfície
  exposta e apertar o teto** antes do piloto, não construir do zero.
- **Limpar órfãos de MX/SPF em `send.molho.live`** no Cloudflare (registros em 1 nível a mais do
  que deveriam) — higiene de DNS, mexe no gate do Resend abaixo.
- ~~Corrigir o comentário mentiroso do `[build]` no `fly.toml`~~ — **FEITO** (dizia "relativo à
  raiz", é relativo ao TOML).

**GATE PENDENTE — bloqueia a validação de OTP (não o boot):** `send.molho.live` **ainda não verificado no Resend**
(DNS propagando). Com `OTP_CHANNEL_*=email`, esse é o único caminho de OTP. **O app JÁ SUBIU sem
isso** — a guarda só exige `RESEND_API_KEY` + `MOLHO_EMAIL_FROM` **presentes** (ver passo 4), não
verificados. O que falha é a **ENTREGA**, silenciosamente, e aí
ninguém loga e o §7 inteiro trava sem erro visível. Esperar o Verified.

**Por que UMA máquina primeiro** (`--ha=false`): isola bug de imagem/secret de bug de fan-out.
Não é contradição com "duas sempre ligadas" — isso é regra de operação, não de primeiro boot.

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

### OTP por E-MAIL no piloto (Resend) — SUPERSEDES a dependência do ZENVIA acima
**Decisão:** no piloto, OTP de **staff E cliente** vai por **e-mail (Resend)**, não SMS. O SMS
**volta ao fim do piloto** — **nada do código de SMS é removido** (adapter Zenvia, cota diária,
guarda, testes ficam intactos). Consequências pro 9c:
- **Zenvia sai do caminho crítico do piloto.** A "dependência dura do ZENVIA" acima passa a valer só
  pra reativação pós-piloto do SMS. O 9c destrava **sem nenhum SMS**.
- **Seleção de canal é CONFIG POR ESCOPO** (env), não código: staff e cliente podem ter canais
  diferentes. **Reativar SMS = mudar env, não escrever código** (gatilho: fim do piloto). Ex. de
  forma: `OTP_CHANNEL_STAFF=email|sms`, `OTP_CHANNEL_CUSTOMER=email|sms` (nome final na implementação).
- **Guarda de produção passa a ser POR CANAL EM USO:** exige provider real **do canal selecionado** —
  escopo em e-mail exige Resend configurado (recusa mock); escopo em SMS exige Zenvia. **Nenhum canal
  NÃO usado bloqueia o boot; nenhum canal em uso cai pro mock em produção.** (A guarda atual do ZENVIA
  vira um caso disto.)
- **Custo:** durante o 9c/staging o Resend fica no **FREE (US$0)** — 100/dia sobra pra logins de
  teste. **NÃO assinar o Pro agora.** O **Pro (US$20/mês, sem teto diário)** é **PASSO DE GO-LIVE**:
  assinar **antes do 1º restaurante real entrar** (quando o volume de cliente cruza 100/dia, senão o
  checkout para numa noite cheia). Fixo compartilhado, substitui o furo variável de SMS. Ver `docs/05`.

**PRÉ-REQUISITO DE DELIVERABILITY (agora é caminho crítico do FUNIL, não do login) — passo de DNS do
go-live, com LEAD TIME:** OTP em spam = pedido perdido. Resend usa **subdomínio de envio
`send.molho.live`** (não exige domínio dedicado). No DNS da Cloudflare (registros **TXT/MX — não
proxiados**, sem a armadilha da nuvem laranja):
- **MX** em `send.molho.live` (bounces) + **SPF TXT** em `send.molho.live`
- **DKIM TXT** em `resend._domainkey` (valor que o Resend gera)
- **DMARC TXT** em `_dmarc.molho.live` — começar `p=none` com `rua`, subir pra `quarantine`/`reject`
- Propagação **até 24h** + rampa de reputação do DMARC = **abrir cedo, em paralelo** (como o domínio).
  Verificar status "Verified" no Resend antes do 1º login de staff.

### OTP por e-mail — passo 3: IDENTIDADE (desenho aprovado pelo PM)

Passo 1 tornou o `OtpService` agnóstico de canal (`OtpRecipient`); passo 2 entregou
`EmailAddress`, a porta `EmailProvider` (Resend/Mock) e o roteamento de canal por escopo
(`otpChannelFor`) com guarda de produção por canal em uso. **Este passo é identidade + migration.**

**A regra que organiza tudo:** `findOrCreate` **não é "por canal", é por CHAVE DE IDENTIDADE**.
Canal é entrega; identidade é chave. Não misturar os dois é o que impede o fim do piloto (volta do
SMS) de virar re-migração de identidade.

- **Staff:** identidade passa a ser chaveada por **e-mail**, permanente.
- **Cliente:** identidade **CONTINUA chaveada por telefone**. O e-mail entra **apenas como canal de
  entrega** durante o piloto (motivo: custo de SMS, ver docs/05). **Invariante: `customers` NÃO ganha
  lookup hash, NÃO ganha unique, NÃO ganha índice por e-mail.** Voltar pro SMS é trocar env.

#### Schema

`users` (staff — identidade vira e-mail):
```
+ email_ciphertext   BYTEA        NULL      -- AES-256-GCM, mesmo helper do telefone
+ email_key_version  INT NOT NULL DEFAULT 1
+ email_lookup_hash  TEXT         NULL      -- HMAC-SHA256(email normalizado, pepper)
~ phone_ciphertext   BYTEA -> NULLABLE      -- staff nascido por e-mail não tem telefone
~ phone_lookup_hash  TEXT  -> NULLABLE
- email              TEXT                   -- coluna MORTA desde o init, DROP
```
Índice único parcial `users_active_email_hash ON users (email_lookup_hash) WHERE deleted_at IS NULL`
(padrão da casa). O único parcial de telefone (`users_active_phone_hash`) fica **intacto** — SMS de
staff continua funcional pra rollback.

`users.email` é dropada porque nunca recebeu um byte (zero leitura/escrita em `apps/api/src`,
`packages/db/src` e no seed desde o `init`). Mantê-la em claro ao lado do hash **anularia o pepper**:
quem tem o dump leria a lista direto.

`customers` (identidade INALTERADA):
```
+ email_ciphertext   BYTEA        NULL
+ email_key_version  INT NOT NULL DEFAULT 1
```
**Sem hash, sem unique, sem índice** — o cliente nunca é buscado por e-mail. É estrutural, não
convenção: sem índice, um `findFirst` futuro não *pode* chavear cliente por e-mail nem por acidente.

#### Cifra em repouso do e-mail: SIM, nos dois lados
Perde-se `WHERE email LIKE`, leitura direta no psql em suporte e relatório por domínio. Ganha-se: um
dump vazado **não entrega a lista de e-mails de lojistas** — que são exatamente as contas com poder de
`owner`, alvo pronto de phishing. O custo de suporte é baixo porque o hash cobre o caso real ("esse
e-mail tem conta?" = aplicar o HMAC e buscar pelo hash); ler o e-mail de um usuário conhecido é script
admin com `decrypt`. **Argumento decisivo:** o telefone já é cifrado na MESMA tabela — deixar o e-mail
em claro criaria duas políticas de PII lado a lado, e a mais fraca vira o teto real (LGPD, regra 11).

#### Pepper: `MOLHO_EMAIL_PEPPER`, dedicada
HMAC-SHA256 determinístico, pepper **fora do banco**: env var (`fly secrets set` em deploy,
`.env.local` em dev), carregada em `packages/db/src/crypto/email.ts`; **ausente = lança**, nunca
degrada pra hash sem pepper.

**Não reusar `MOLHO_ENCRYPTION_KEYS`** (que é o que `hashPhoneForLookup` faz hoje, usando a chave AES
como chave HMAC). Precedente correto no repo é o `MOLHO_OTP_HMAC_KEY`, já separado. Motivo além da
higiene de primitivas: **os ciclos de vida são diferentes**. A chave de cifra rotaciona barato
(`*_key_version`, rotação lazy linha a linha). O **pepper não** — o hash É o índice de busca, então
trocar o pepper exige re-hashear a tabela num job offline. Amarrar os dois faria toda rotação de cifra
virar migração em massa. **O pepper é chave de vida longa, por desenho.**

#### Migration (SQL à mão, idempotente)
`ADD COLUMN IF NOT EXISTS`, `CREATE UNIQUE INDEX IF NOT EXISTS`, `ALTER COLUMN … DROP NOT NULL`,
`DROP COLUMN IF EXISTS` — replay do shadow database exige idempotência (CLAUDE.md).

- **Múltiplos NULL:** não é problema. Índice único do Postgres trata cada NULL como distinto, então os
  staff atuais (todos sem e-mail) convivem sob `users_active_email_hash` **sem backfill prévio**.
- **Colisão por normalização:** **não existe na migration** — a coluna `email` nunca recebeu dado, o
  backfill é de zero linhas, não há duas grafias pra colidir. O caso existe só em **runtime** e o
  desenho já o resolve: `parseEmail` normaliza (trim+lowercase) ANTES do HMAC, então `Ana@x.com` e
  `ana@x.com` batem no mesmo hash e caem no mesmo registro — que é o comportamento certo (é a mesma
  pessoa). Corrida de dois requests simultâneos: catch de `P2002` → re-`findFirst`. Se um dia houver
  dado real em claro pra migrar, aí sim precisa de passo de deduplicação — **não aplicável hoje**.
- **Unique só onde a identidade é por e-mail:** `users` sim, `customers` **nunca**.
- **RLS:** nada muda. `users` não tem RLS por desenho; as policies de `customers` são por linha
  (`app_tenant_visible(tenant_id)`) e cobrem colunas novas automaticamente.

#### Fluxo por escopo

**Staff:**
```
request:  parseEmail(dto.email) → emailRecipient(email, EMAIL_PROVIDER) → requestOtp('staff', …)
verify:   parseEmail(dto.email) → verifyOtp(…) → staffIdentity.findOrCreateByEmail(email)
```
`findOrCreateByEmail` espelha o método atual (hash → `findFirst` → senão `create`), grava
`email_ciphertext`/`email_key_version`/`email_lookup_hash` e **nenhum telefone**. Segue nascendo **sem
`user_role`** (menor privilégio, regra 2). `findOrCreateByPhone` **não é removido**.

**Cliente (TOFU — trust on first use):**
```
request(dto.phone, dto.email):
  identifier do desafio = E.164 do telefone        ← INALTERADO (chave, rate limit, cooldown)
  entrega = existe customer com esse phone_lookup_hash E email_ciphertext?
              → e-mail DE REGISTRO (IGNORA o digitado)
              → senão: e-mail digitado
verify:  verifyOtp(identifier = telefone) → findOrCreate(tenantId, phone)
         → grava email_ciphertext se ainda não houver
```
Chave do desafio, balde de rate limit e cooldown continuam **byte a byte** o que são hoje. Só o
`deliver` troca de canal — é isso que torna a volta do SMS uma troca de env.

#### Riscos aceitos e registrados (decisão consciente do PM, não gap silencioso)

**TOFU no cliente — a janela é praticamente o piloto inteiro.** Com entrega por e-mail, o fator
verificado deixa de ser o telefone: o código prova controle do **e-mail**, e o telefone que chaveia a
identidade passa a ser auto-declarado. O TOFU protege quem **já tem** registro (a entrega vai pro
e-mail de registro, ignorando o digitado), mas **o piloto começa com a base em ZERO** — logo, para
todo telefone ainda sem registro, quem chegar primeiro vincula aquele telefone ao e-mail que digitar.
Na prática a janela de tomada de conta cobre quase todo o piloto. **Risco aceito** porque o ativo é de
baixo valor (endereço salvo + histórico de pedidos, por tenant) e **não há dado de pagamento** — o PIX
é estático/manual, cartão nunca toca o servidor (regra 10). A alternativa (entregar sempre no e-mail
digitado) foi **rejeitada**: abriria tomada de conta de cliente EXISTENTE. Ao voltar pro SMS, os
telefones voltam a ser verificados naturalmente, sem migração.

**Merge de identidades de staff — Fase 2, explicitamente.** Um mesmo humano que logou por SMS e depois
por e-mail vira **dois `users`**: chaves diferentes, sem vínculo, e os `user_roles` ficam presos ao
registro antigo. No piloto é inofensivo (o canal é fixo por deploy, os dois não coexistem) e o owner do
seed nasce já com e-mail. **Unificar identidades por múltiplos identificadores é Fase 2** — não existe
neste passo, e não deve ser improvisado depois sem entrar no plano.

#### Fiação nos controllers e no front
- Controllers injetam `EMAIL_PROVIDER` além do `MESSAGING_PROVIDER` e chamam `otpChannelFor(escopo)`
  pra montar o recipiente — função local de poucas linhas, **sem** `RecipientFactory` no DI.
- **DTOs:** campos `@IsOptional` + checagem de presença no controller conforme o canal (em vez de
  validação condicional do `class-validator`, ilegível, ou DTOs duplicados por canal).
- **Anti-enumeração preservada:** `202` incondicional no `request`, sem branch de existência de conta
  em nenhum caminho de sucesso — vale igual pra e-mail.
- **Canal no front: BACKEND É FONTE ÚNICA.** `GET /v1/store/:slug` passa a devolver `otpChannel`
  (populado de `otpChannelFor('customer')`, da env do backend) e o storefront lê o canal de lá.
  **`NEXT_PUBLIC_OTP_CHANNEL_CUSTOMER` está REJEITADO** — env pública no front duplicaria a fonte de
  verdade e as duas poderiam divergir num deploy. Hoje o valor é global de deploy, mas é entregue por
  um endpoint **por-tenant**: quando o canal virar config de tenant, o contrato já está no lugar certo.
- **Storefront:** `MoOtpSheet` (wired em `apps/storefront/app/[slug]/carrinho/cart-view.tsx`) tem
  `step: 'phone' | 'code'` e a copy "Enviamos um código de 6 dígitos por SMS" hardcoded — ganha campo
  de e-mail e copy condicional ao canal.
- **Backoffice:** nada a fazer — o login de staff é o 9b. Este passo entrega o backend que ele consome.

### Pré-requisito da validação de fronteira: owner do seed com E-MAIL REAL
(Antes era telefone/SMS; com OTP por e-mail, o identificador de staff no seed vira **e-mail**.)
`MOLHO_SEED_STAFF_PHONE` → **`MOLHO_SEED_STAFF_EMAIL`**, e o seed de CLIENTE também passa a ter e-mail.
O resto abaixo (guarda de produção do seed, fallback, cifragem) continua valendo — só muda o campo.

**Isto é BLOQUEANTE, não cosmético:** o owner do seed hoje só tem telefone → não é achável por e-mail
→ o primeiro login por e-mail criaria um `user` NOVO **sem papel nenhum**, e o backoffice do staging
fica inacessível. O seed passa a gravar e-mail no owner: `MOLHO_SEED_STAFF_EMAIL` quando presente,
fictício determinístico (`owner@hamburgueria-da-vila.test`) no fallback — CI/dev seguem
determinísticos e a guarda de `NODE_ENV=production` continua valendo.

### (histórico) Pré-requisito quando o canal era SMS: owner do seed com telefone REAL (opt-in do sandbox)
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
- **Health check: RESOLVIDO.** `/health` existe (`src/health/health.controller.ts`) — sem prefixo global, sem guard global no `AppModule`, payload estático que **não toca banco nem Redis** (liveness, não readiness de dependência). O `fly.toml` usa `[[http_service.checks]]` nele; o check TCP saiu.
- **Build context: RESOLVIDO** (ver "ESTADO ATUAL" no topo) — builda da RAIZ do monorepo, comando único documentado no cabeçalho do `fly.toml`. O `.dockerignore` da raiz já existia e cobre `**/node_modules`, `**/.next`, `**/dist`, `**/.turbo`, `.git`, `**/.env*`: sem ele o context vai de poucos MB pra ~1,5 GB.
- **`pnpm install --frozen-lockfile` com manifests parciais** (só `apps/api` + `packages/db` + `packages/contracts`, sem `packages/ui`) **funciona** — verificado fora do Docker replicando o context. O lockfile não exige o importer ausente.

### 4. Secrets na Fly (`fly secrets set`) — FEITO, 12 staged (lista no "ESTADO ATUAL")
- **A guarda de produção do OTP é POR CANAL EM USO, não global** (`messaging.module.ts`): com
  `OTP_CHANNEL_*=email`, o boot exige `RESEND_API_KEY` + `MOLHO_EMAIL_FROM` e **NÃO a
  `ZENVIA_API_KEY`** — o canal SMS desligado não bloqueia o boot. (A linha antiga deste passo,
  "`ZENVIA_API_KEY` — boot falha sem ele em prod", era de quando o canal era SMS; ficou obsoleta
  com a decisão de OTP por e-mail §"SUPERSEDES" acima. Não é bug de código.)
- ⚠ **`otpChannelFor` faz default `'sms'` quando a env está ausente** — de propósito (a virada é
  ato explícito de config). Consequência operacional: se `OTP_CHANNEL_*` não chegar na máquina, o
  boot **falha pedindo Zenvia**. Fail-closed correto, e o modo de falha mais provável do 1º deploy.
- **`MOLHO_EMAIL_PEPPER` não é checada no boot** — explode no primeiro `hashEmailForLookup()`
  (`packages/db/src/crypto/email.ts`): throw preguiçoso, quebra o **primeiro login**, não o boot.
  Não confiar em "subiu = está configurado" — a prova é o passo 7, não o `/health`.
- **`MOLHO_JWT_SECRETS` é diferente: quebra o BOOT** (`loadJwtSecrets` roda no carregamento do
  módulo). Formato = **mapa JSON versão→chave** `{"1":"<32 bytes base64>"}`. Valor não-JSON =
  crash-loop, não erro de login — foi exatamente o que aconteceu no 1º deploy (ver "ESTADO
  ATUAL"). Setar com aspas simples por fora no shell.
- **`MOLHO_CORS_ORIGINS` é obrigatória na prática:** sem ela o CORS cai no default de DEV
  (`localhost:3000/3001`) e a validação de fronteira do §7 não funciona. Staging aponta pra
  `https://staging.molho.live`.
- **Opcionais:** `MOLHO_MAX_SMS_PER_DAY` (teto de custo de SMS — irrelevante com o canal em e-mail).
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
  - **`X-Content-Type-Options: nosniff` — FEITO e verificado no ar (2026-08-04):** a resposta de
    `api.staging.molho.live` traz `nosniff` + `X-Frame-Options: DENY` + ACAO com credentials.
    (CSP completa segue sendo item PM separado, pré-go-live — não neste passo.)

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

**FEITO no staging (2026-08-03):** `staging.molho.live` (CNAME Vercel) e `api.staging.molho.live`
(A/AAAA Fly, cert Let's Encrypt **Issued**), ambos **CINZA**. `molho.live` (raiz, `app.`, `api.`,
`*.`) segue **reservado pro piloto** — este passo continua pendente pra produção.

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
