# CLAUDE.md — Contexto para o Claude Code

Você está no monorepo do **Molho**, plataforma SaaS multi-tenant de cardápio digital, PDV e delivery pra restaurantes brasileiros. Design inspirado em fintechs (Nubank). Cliente-alvo: restaurante com delivery próprio, R$ 40–150 mil/mês, que hoje anota pedido no WhatsApp na mão.

## Leia primeiro (fonte da verdade)

Antes de qualquer decisão de arquitetura ou implementação, consulte `docs/` nesta ordem:

1. **`docs/01-plano-produto.md`** — arquitetura, catálogo de módulos, RBAC, roadmap dos 27 épicos
2. **`docs/02-definicoes-v1.md`** — ICP, escopo do MVP, planos, máquina de estados de pedido
3. **`docs/03-self-setup.md`** — onboarding self-service, temas, billing
4. **`docs/04-brand-design-system.md`** — tokens, componentes, tom de voz, léxico

Assets em `brand-kit/`.

**Débitos e armadilhas de tooling:** `docs/07-aprendizados.md` — consulte quando um erro parecer familiar ou antes de mexer em migration, build ou teste.

## Stack obrigatória

- Monorepo **Turborepo + pnpm** com: `apps/storefront`, `apps/backoffice`, `apps/api`, `packages/ui`, `packages/db`, `packages/contracts`
- Frontends: **Next.js 15 App Router + TS + Tailwind + shadcn/ui** re-estilizado com o design system Tempero
- Backend: **NestJS + Prisma + PostgreSQL (RLS por `tenant_id`) + Redis + BullMQ + Socket.io**
- Testes: **Vitest** (unit) + **Playwright** (e2e do fluxo de pedido)

## Infra ativa (dev)

- **Vercel:** `https://molho.vercel.app` (fronts)
- **Gestor em staging (criado em 2026-08-14):** projeto Vercel dedicado `molho-backoffice-staging`, com Root Directory `apps/backoffice`, Framework Preset `Next.js`, build/output padrão do Next e Node.js 24.x. Domínio principal de produção: **`https://staging-app.molho.live`**; domínio técnico: `https://molho-backoffice-staging.vercel.app`. Ambos aparecem como `Valid Configuration`; o DNS de `staging-app.molho.live` resolve por CNAME para `f8ec698b54ba38f0.vercel-dns-017.com`. A variável `NEXT_PUBLIC_API_URL=https://api.staging.molho.live` está configurada como Sensitive para Production e Preview. Conferência externa: `/` e `/gestor` respondem HTTP 200. **Estado de deploy:** o Production/custom domain ainda aponta para `main@2481d1e`; o deploy da branch `codex/epico-9b-login-staff@f5bb0b5` está `Ready` apenas como Preview. Portanto o login real do 9b só chega ao domínio do gestor depois de revisão, merge e novo deploy/promoção — não confundir preview verde com produção atualizada.
- **Neon:** Postgres (URL em `.env.local`)
- **Upstash:** Redis (URL em `.env.local`)
- **Cloudflare R2:** bucket `molho-uploads` (credenciais em `.env.local`)
- **Resend:** e-mail transacional

No dev, cada tenant é servido em rota: `molho.vercel.app/{slug}`. Em produção será `{slug}.molho.live` (a lógica de resolução de tenant deve ser configurável para trocar sem refactor).

## Infra de produção (decidida no Épico 9)

A `apps/api` (NestJS) é um **processo Node de vida longa** — não roda serverless. O gestor de pedidos realtime (Épico 9) usa SSE + Redis pub/sub, que **exigem** um host com conexões HTTP longas e processo persistente (Vercel Functions mata o stream no timeout; máquina scale-to-zero não segura conexão nem subscriber de pub/sub). Decisões travadas:

- **Domínio: `molho.live`** (registrable domain único). Backoffice em `app.molho.live`, API (REST + SSE) em `api.molho.live`, storefronts em `{slug}.molho.live` (wildcard `*.molho.live`, TLS único). `app.` e `api.` são **same-site** — é o que faz o cookie de stream funcionar (ver desenho de auth do Épico 9).
- **API na Fly.io, região `gru` (São Paulo), DUAS máquinas SEMPRE LIGADAS com rolling deploy.** Nunca scale-to-zero. Duas máquinas (não uma) porque **máquina única não faz rolling deploy** — todo deploy mataria 100% dos streams SSE juntos, gerando tempestade de reconexão + refetch REST simultâneo contra o Neon frio (P2028, docs/07). Com ≥2, a Fly derruba uma por vez e a outra segura as conexões; o fan-out por pub/sub **já foi desenhado pra multi-instância**. Custo ~$8/mês (2×512MB) — vale só por eliminar a janela de indisponibilidade no pico do jantar. Fly Proxy termina TLS no edge com **HTTP/2 (ALPN `h2`) por padrão** — resolve o teto de ~6 conexões/domínio do HTTP/1.1 no lado do browser (o app fala HTTP/1.1 com o proxy, irrelevante).
  - **Graceful shutdown no SIGTERM (Épico 9):** o rolling deploy da Fly manda SIGTERM e espera. `main.ts` chama `app.enableShutdownHooks()`, e o `OrderStreamController.onApplicationShutdown()` fecha cada stream SSE aberto com um evento `server_shutdown` + `complete()` — o cliente reconecta na hora (na outra máquina), em vez de pendurar até timeout de TCP. Sem isso, a migração lenta anularia exatamente a janela que as duas máquinas existem pra eliminar.
  - **Pool do Neon (config de produção obrigatória com 2 instâncias):** o runtime DEVE usar a connection string **pooled** do Neon (hostname com `-pooler`, PgBouncer transaction mode) — **hoje `DATABASE_URL` aponta pro endpoint direto (sem `-pooler`), o que não escala pra 2 instâncias.** Prisma sob PgBouncer exige `?pgbouncer=true` (desliga prepared statements; o `SET LOCAL app.tenant_id` do `RequestContextService` funciona sob transaction pooling porque é escopado à transação). `DIRECT_URL` (migrations, `app_migrator`) continua no endpoint **direto** — migration precisa de session mode. E o `max` do pool do adapter (`PrismaPg`) DEVE ser setado **explícito por instância** (hoje herda o default 10 do node-postgres), dimensionado pra que `2 × max` caiba no limite de conexão do compute — não confiar no default.
  - **Distribuição de conexões SSE após rolling deploy (a MEDIR no piloto, não resolver agora):** conexão longa não redistribui sozinha — depois de um rolling deploy os clientes reconectam e podem empilhar na máquina que subiu primeiro. O jitter+backoff do cliente alivia mas não equilibra. Medir o balanço real no piloto antes de assumir equilíbrio ou investir em rebalanceamento.
  - **Teto de conexões SSE por máquina (a MEDIR no piloto, sem cap construído).** Não há limite por usuário/tenant/máquina hoje — YAGNI: a carga real é minúscula (um punhado de abas do gestor por loja × centenas de lojas = baixas centenas de conexões, bem abaixo de qualquer preocupação). Estimativa a validar numa `shared-cpu-1x` 512MB em GRU: cada conexão SSE ociosa custa pouco (socket + Observable + 2 timers + closure, dezenas de KB), então a ordem de grandeza esperada é **~1–2k conexões simultâneas** antes de pressão de memória/event-loop; o custo por evento é O(subscribers do tenant) no dispatch do hub. **Medir memória/latência reais no piloto antes de assumir o teto ou construir cap por usuário/tenant.**
- **Neon migra de `aws-us-east-1` (default aceito sem decisão) pra `aws-sa-east-1` (São Paulo).** Regra: **API co-localizada com o Postgres**, não com o usuário — latência API↔DB paga em toda query (transação + `SET LOCAL` + N queries por request); latência usuário↔API paga uma vez. Pricing do Neon é uniforme entre regiões (migração custo-neutra). Motivadores extras: LGPD/residência de dados de consumidor brasileiro no Brasil, e latência do usuário deixa de ser transatlântica. **Migração barata agora (só schema/migrations/seed, sem dado de produção — piloto não subiu); cara pós-go-live (janela de indisponibilidade).**
- **Upstash (Redis): região PENDENTE de confirmação.** Carrega pub/sub do SSE + refresh token — os dois no caminho crítico. Se estiver nos EUA, migra pra Upstash São Paulo junto com o Neon (pub/sub e refresh cross-Atlântico matam latência de realtime e de auth). Não migrar até confirmar a região atual no console.
- **CI (`.github/workflows/ci.yml`) é quality-only — não faz deploy.** Deploy da `apps/api` na Fly é passo separado (fora do CI hoje). Deploy dos fronts é a Vercel.

**`apps/api` não carrega `.env.local` sozinho** — `pnpm dev` roda via `dotenv-cli`; `start` (produção) não, de propósito (env vars vêm da plataforma em deploy real). Ver docs/07 pro incidente que descobriu isso.

## Escopo do MVP (semanas 1–8, épicos 1–14)

**Dentro:** cardápio · importação CSV/XLSX · storefront (menu, carrinho, bottom sheets) · endereços com zonas de entrega (polígonos) · horários e pedido mínimo · checkout com **PIX estático** (confirmação manual) · gestor de pedidos realtime com push/som/fila offline · impressão ESC/POS com wizard · **WhatsApp click-to-chat** · página de acompanhamento · onboarding self-service · **4 templates de tema** · **assinatura e billing** (trial 7 dias, dunning) · super-admin.

**Fora do MVP** (módulos DESLIGADOS, não implementar): cupons, fidelidade, promoções, combos, cartão online, KDS, PDV, caixa, garçom, motoboy, iFood, NFC-e, campanhas, franquias. Fases 2–4.

## Regras críticas (não-negociáveis)

1. **Modularidade desde o dia 1.** Toda feature é um MÓDULO em `packages/contracts/modules.ts` com `plans`, `requires`, `default`, `addon`. Backend com `@RequireModule('key')`; frontend com `<Gate module="key" fallback={<Upsell/>}>`; navegação do backoffice é GERADA do registry, nunca hardcoded. Módulo desligado é não-destrutivo. `ModuleService.isModuleActive(tenantId, key)` (`packages/db`) responde "entitled AND enabled AND released" — nunca reimplementar inline. Invalidação de cache é automática (`withModuleInvalidation()` no Prisma Client).
2. **RBAC granular.** Sempre `can(user, 'permission', {scope})`, nunca `if (role === 'x')`. Papéis são conjuntos de permissões em `packages/contracts/permissions.ts`. Dupla checagem: `@RequireModule + @RequirePermission`. RLS no Postgres como última linha.
   **Bootstrap de `user_role`:** staff nasce **sem** papel no primeiro login por OTP (menor privilégio por padrão); o primeiro `user_role('owner', ...)` nasce automaticamente na criação do tenant (Épico 13); todo papel depois só nasce via fluxo de convite (Fase 2+), nunca auto-atribuído; `customers` nunca tem `user_role`.
3. **Multi-tenancy.** `user_roles(user_id, role, scope_type, scope_id)`. RLS por `tenant_id` no Postgres em toda tabela com esse campo. Escrever testes explícitos de isolamento entre tenants. **Exceção deliberada:** `users` e `user_roles` NÃO têm `tenant_id` (identidade global — suporte e franquia atuam em vários tenants) e por isso NÃO têm RLS — toda query em `user_roles` exige escopo explícito no `WHERE` (`scope_id`/`scope_type`), nunca ler a tabela inteira e filtrar em memória; é a única camada sem RLS como rede de segurança.
   **Duas semânticas de identidade, nunca misturadas:** **Staff** (`users`, identidade global, usa `user_roles`+`can()`) e **Customer** (`customers`, escopo por `tenant_id`, RLS normal, sem `user_roles`/`can()`). NUNCA um discriminador `is_customer` dentro de `users`: o índice único de `phone_lookup_hash` em `users` é global (não comporta o mesmo telefone em múltiplos tenants como registros isolados, que é a regra de cliente final). `customers` tem único parcial em `(tenant_id, phone_lookup_hash)`.
4. **Dinheiro é INTEIRO em centavos.** Nunca float.
5. **Pagamento no MVP** (até o épico 24): PIX ESTÁTICO com confirmação manual. Pedido nasce direto como `received` com `payment_status: 'aguardando_confirmacao'`; lojista marca "pago" ao conferir o app do banco; estorno é manual. Auto-cancel em 10min e estorno automático só com PIX online (épico 24).
6. **WhatsApp no MVP = click-to-chat.** O sistema NUNCA envia mensagem sozinho: monta o texto e abre `https://wa.me/{fone}?text={msg}` pro lojista tocar em enviar, pelo número normal dele. NÃO usar Cloud API nem API não-oficial (Baileys/Evolution). **`MessagingProvider` (envio automático) e `ClickToChatProvider` (link pra envio humano) são DUAS abstrações diferentes, nunca confundir.** OTP usa `MessagingProvider` (SMS via Zenvia — WhatsApp automatizado é Fase 2). Status de pedido usa `ClickToChatProvider` — é o lojista, humano, no loop.
7. **Idempotência ponta a ponta.** `Idempotency-Key` em cobranças; webhooks dedup por `psp_ref`.
8. **Adapters plugáveis** para todo serviço externo: `PaymentProvider`, `MessagingProvider`, `ClickToChatProvider`, `MapsProvider`, `FiscalProvider`, `MarketplaceProvider`. Mock primeiro; adapter real depois. `MapsProvider` nasce só como port — endereço em texto + `navigator.geolocation` nativo cobre o MVP sem chave de API. Adapter real futuro: Mapbox, não Google Maps (tier grátis sem cartão).
9. **RLS + auditoria.** Ação sensível (dinheiro, permissão, módulo) grava em `audit_log(actor, role, action, before, after, ip, at)`.
10. **Sem dados no cliente.** Cartão nunca toca nosso servidor — tokenização via SDK do PSP. PCI-DSS SAQ-A.
11. **LGPD.** Telefone criptografado em repouso, endpoint de exclusão, contrato de operador. Nunca logar dado pessoal cru.
12. **Máquina de estados:** `pending_payment → received → preparing → ready → in_transit → completed` + infelizes (`expired`, `auto_canceled`, `canceled`, `delivery_failed`). Ver `docs/02-definicoes-v1.md` §5.
13. **Endereço do cliente é anônimo até o checkout.** Durante a navegação, o endereço em uso vive só no `localStorage` (mesmo padrão do carrinho, `packages/contracts/src/cart.ts`) — forçar OTP só pra checar cobertura de entrega queimaria SMS à toa. A tabela `addresses` existe desde o Épico 6 (tenant-scoped, RLS) mas fica **vazia** até o checkout gravar a linha. **OTP só é pedido no "Fazer pedido" final** — identidade real só é necessária quando o pedido precisa ser vinculado a um `customer`.
    **EMENDA (Épico 9c): o OTP no "Fazer pedido" é CONDICIONAL ao módulo `checkout.guest`.** Desligado (o default, e o estado de qualquer tenant sem linha em `tenant_settings`), vale a regra acima sem mudança. Ligado, `POST /checkout/orders` aceita request **sem `Authorization`**: telefone + nome vêm no body, `findOrCreate` resolve o `customer` e o pedido nasce. O módulo se chama pela ponta **permissiva** de propósito — ausência de linha = `false` = OTP exigido, fail-closed por construção (um `checkout.require_otp` desligaria a verificação por esquecimento de provisionamento).
    **O que o interruptor NÃO afrouxa** (invariantes, não detalhe de implementação):
    - **"Sem OTP" é sem SESSÃO, não sessão sem verificação.** Nenhum token é emitido no caminho guest. `/checkout/orders` é o único consumidor do `CustomerJwtAuthGuard` — o JWT de cliente só carimba `customer_id` num pedido, não abre leitura de nada. Por isso o interruptor não cria superfície de leitura: não existe endpoint autenticado de cliente pra alcançar.
    - **`Authorization` ausente → caminho guest; presente e inválido/expirado → 401, NUNCA guest.** Token ruim caindo pra pedido anônimo seria downgrade silencioso de auth.
    - **Token presente ⇒ o bloco `customer` do body é rejeitado com 400**, nunca ignorado — senão um cliente logado carimbaria o pedido no telefone de outro.
    - **`customer.phone` fica FORA do `checkoutRequestSchema` compartilhado.** O schema serve os dois endpoints, e `/checkout/revalidate` é público, anônimo e de alto volume: pôr telefone na base levaria PII pra uma superfície que não precisa dela.
    - **Escrita pública exige balde próprio.** Sem OTP, `/checkout/orders` vira escrita pública e o pedágio incidental contra spam some. O cap é **MIDDLEWARE** (5/10min por slug+IP), aplicado **antes do `GeocodeMiddleware`** — Guard rodaria depois de todo middleware e não protegeria a chamada externa (mesmo racional do `GeocodeIpRateLimitMiddleware`).
    - **Procedência fica gravada:** `customers.phone_verified_at` (só o OTP carimba) e o snapshot `orders.customer_verified` no momento do pedido. Sem isso, "esse telefone é real?" vira pergunta sem resposta no banco quando o SMS voltar.
    Restrição herdada: pedido guest não tem sessão, então a página de acompanhamento (Épico 12) só pode ser por **link não-adivinhável**, nunca por "meus pedidos".
14. **Divergência entre o carrinho (client-side) e a revalidação do servidor no checkout exige consentimento ativo quando é desfavorável ao cliente — nunca um toast que ele pode não ver.**
    - **Item ficou indisponível:** tela de revisão obrigatória — item removido, novo total, botão explícito pra continuar.
    - **Preço subiu** (produto ou entrega): tela de revisão obrigatória com valor antigo, novo e total — o cliente confirma ou volta pro carrinho.
    - **Preço caiu, ou entrega manteve/caiu:** toast informativo, segue direto — nunca precisa de consentimento pra pagar MENOS.
    - **O pedido só é criado no banco depois da confirmação explícita.** A revalidação (preço, disponibilidade, modificadores, zona, horário, pedido mínimo) roda numa transação só, contra o estado FRESCO do banco — nunca confiando no snapshot do cliente.
    - **"Numa transação só" não é "snapshot consistente"** — `RequestContextService.run()` roda sob READ COMMITTED, então existe uma janela real (poucos ms) entre revalidar e escrever. Zona/horário/pedido mínimo mudarem nela é débito tolerável; **preço e disponibilidade não são** — por isso `createOrder()` chama `lockProductsForUpdate()` (`SELECT ... FOR UPDATE`) ANTES de revalidar, fechando a corrida. Só no caminho de `/checkout/orders` — `/checkout/revalidate` (leitura pública) continua sem lock.
15. **Transição de status de pedido só por uma função única (`transitionOrderStatus`) que valida a transição na máquina de estados ANTES de aplicar — nunca `UPDATE` direto no campo `status`.** `received → completed` pulando `preparing` tem que ser rejeitado pelo código, mesmo princípio do `can()` do RBAC (regra 2). **Toda transição grava em `audit_log`** — ator, papel, timestamp — inclusive a criação inicial do pedido.

## Convenções de schema (Postgres)

- **PK = `uuid` v7** em toda tabela. Nunca `bigserial`/serial — ID sequencial expõe ordem e volume de criação.
- **Índice composto em tabela com `tenant_id` sempre começa por `tenant_id`.**
- **Soft delete:** toda tabela mutável tem `deleted_at` nullable, exceto append-only (`audit_log`, `module_audit`, `notification_log`). **Toda `UNIQUE` que interage com soft delete vira índice único parcial** (`WHERE deleted_at IS NULL`) — senão o registro apagado trava o valor pra sempre. Exceção: soft-delete já dentro de PK composta (`tenant_entitlements`/`tenant_settings`) — parcial ali é só otimização.
- **Optimistic locking:** `version int not null default 0` em tabelas mutáveis de negócio. Update com `WHERE version = :esperado`; 0 linhas = `ConflictError`.
- **Telefone (LGPD):** nunca em claro. Cifra na aplicação (AES-256-GCM, `MOLHO_ENCRYPTION_KEYS`) + `phone_lookup_hash` (HMAC) pra busca por OTP. `phone_key_version` permite rotação sem migration em massa. E-mail de staff segue a MESMA política (`email_lookup_hash`, pepper própria `MOLHO_EMAIL_PEPPER`).
- **Seletor por `*_lookup_hash` SEMPRE vem de `hashPhoneForLookup()`/`hashEmailForLookup()` — NUNCA de um `string | null` lido do banco.** Em `users` as duas colunas de hash são **nullable** (staff por e-mail não tem telefone; staff por telefone não tem e-mail), e o Prisma aceita `null` num `where` como filtro **válido e silencioso**: `where: { phone_lookup_hash: null }` não acha "nada", acha **todo mundo sem telefone**. O caso que originou a regra: o cleanup dos testes e2e fazia `deleteMany({ where: { phoneLookupHash: hash } })` com o hash lido de volta do banco — bastava um staff criado por e-mail pra aquele `deleteMany` apagar **todos** os staff de e-mail do ambiente. Valor lido do banco só vira seletor depois de guarda explícita (early-return/throw se null). Filtrar "registros sem telefone" é legítimo, mas exige `{ phone_lookup_hash: null }` **literal**, escrito com intenção — nunca uma variável que por acaso resolveu pra null. Vale igual pra `email_lookup_hash`. (Guarda estrutural — branded type ou regra de ESLint — foi avaliada e **recusada** por ora: os seletores de produção derivam todos de `hash*ForLookup()`, e o tipo não alcançaria quem escreve `client.user.findFirst()` cru, que é justamente o vetor restante. Decisão reversível se a superfície crescer.)
- **RLS:** `app_migrator` (dono, roda DDL) vs `app_runtime` (só DML, sujeito a policy). Toda policy usa `app_tenant_visible(tenant_id)`, que lê GUCs `app.tenant_id`/`app.is_platform` — sem eles setados, nega por padrão (fail-closed).
- **Migrations do Prisma não dependem de propriedade do schema** — ACL de nível schema vira no-op silencioso dentro de `prisma migrate`. Esses comandos vivem em `packages/db/prisma/bootstrap.sql`, rodado uma vez por ambiente pelo admin do banco.
- **`prisma migrate dev` requer `NEONDB_SHADOW_URL`** com PostGIS pré-instalado. Setup em `docs/setup-shadow-database.md`.
- **Índice único parcial nunca vem do `schema.prisma`** — sempre SQL à mão na migration, com comentário no model.
- **Ao aceitar migrations geradas, SEMPRE inspecionar** e apagar `ALTER COLUMN updated_at DROP DEFAULT` — falso drift.
- **`generator client` precisa de `moduleFormat = "cjs"`** — sem isso o client do Prisma 7 emite `import.meta.url`, que quebra via `require()` (docs/07).
- **Nunca `prisma migrate dev` liso num repo com SQL à mão** — trava esperando stdin. Fluxo seguro: `--create-only` → editar `migration.sql` → `prisma migrate deploy` → `prisma generate` (docs/07).
- **Todo SQL à mão em migrations DEVE ser idempotente:** `CREATE OR REPLACE FUNCTION`, `DROP POLICY IF EXISTS`+`CREATE POLICY`, `CREATE INDEX IF NOT EXISTS`, `IF NOT EXISTS` em tabela/coluna, `DO $$ ... EXCEPTION WHEN duplicate_object` em FK. Razão: `prisma migrate dev` replaya o shadow database várias vezes por invocação.

## Contexto de request (RLS + connection pooling)

`SET LOCAL app.tenant_id`/`app.is_platform` só vale dentro de UMA transação/conexão — com pool, duas queries do mesmo request podem pegar conexões físicas diferentes.

**REGRA HARD: todo acesso ao banco em request path DEVE passar pelo client transacional do `RequestContextService`** (abre uma transação por request, roda `SET LOCAL` primeiro, guarda o client em `AsyncLocalStorage`). Uso direto do `PrismaClient` global num service de `apps/api/src` é **lint error** (exceto `context/context.module.ts` e o próprio `RequestContextService`). Exceção: jobs administrativos (`app_migrator`) usam o client global com contexto de tenant explícito próprio.

**Guards rodam ANTES de qualquer Interceptor** (Middleware → Guards → Interceptors "antes" → Pipes → Handler). `TenantContextInterceptor` normalmente abre o `RequestContextService.run()` que envolve o handler — um Guard que precise ler o banco (ex.: `JwtAuthGuard` conferindo `token_version`) executa ANTES desse `run()` existir. Solução: o Guard abre seu próprio contexto de plataforma, isolado, pra sua leitura pontual.

**REGRA HARD: NENHUM I/O externo (HTTP, DNS, S3, PSP) dentro de um `RequestContextService.run()`.** O `run()` abre uma transação do Postgres e **fixa uma conexão física do pool** por toda a duração dela. Uma chamada HTTP de 2–5s lá dentro segura essa conexão o tempo todo — com `max` do pool na casa de 10 por instância, algumas dezenas de requests concorrentes esgotam o pool e o sintoma é P2028/timeout de conexão (docs/07), não erro de rede. Pior em superfície **pública e pré-OTP**: é weaponizável (bot com entradas distintas fura o cache e prende N conexões sem nunca se autenticar).

O `TenantContextInterceptor` abre o `run()` **envolvendo o handler inteiro** (`intercept()` → `from(this.requestContext.run(ctx, () => firstValueFrom(next.handle())))`) — logo, **controller e service já rodam dentro da transação**. "Fazer o I/O no começo do service" ou "antes do `lockProductsForUpdate`" NÃO resolve: a conexão já foi adquirida.

O único ponto que roda antes do `run()` é **Middleware** (Middleware → Guards → Interceptors → Pipes → Handler). Então: I/O externo que alimenta um handler vive em middleware, que resolve o valor e o anexa ao `request` (mesmo padrão de `request.user`); o handler consome o valor já pronto. É o desenho do geocoding do Épico 6 (`apps/api/src/geo/` + `geocode.middleware.ts`): Redis + ViaCEP + Nominatim resolvem o ponto **inteiramente fora** da transação, e a revalidação/criação de pedido só recebe `lat`/`lng` já materializados. **Rate limit por IP dessas rotas também tem que ser middleware, ordenado ANTES do middleware de I/O** — um `CanActivate` roda depois e não protegeria a chamada externa.

**`@typescript-eslint/consistent-type-imports` está DESLIGADA em `apps/api/src/**`** (fora de teste) — NestJS resolve DI e valida DTO via reflexão de CLASSE (`design:paramtypes`/`emitDecoratorMetadata`), e `import type` apaga essa referência em runtime, quebrando injeção e validação na prática.

## Design system "Tempero"

- Roxo Molho `#820AD1` (primária). No storefront white-label, o lojista escolhe **1 de 4 templates** (Roxo, Brasa `#D93025`, Folha `#0F8A5F`, Grafite `#141216`) — constantes em `packages/ui/themes.ts`, todos AA por construção. NÃO existe seletor de cor livre.
- Inter para tudo. Números tabulares (`tnum`) em PDV, caixa e dashboard.
- Radius 20px em cards, 14px em botões. Espaçamento em escala 4pt.
- Bottom sheets para modais mobile. Timeline vertical com dots animados para status. Skeletons em todo loading.
- Microcopy pt-BR informal, com léxico de restaurante ("comanda", "salão", "no capricho"). Ver §2 do doc de marca.

## Convenções de trabalho

- **Ponytail (se instalado) fica em `lite`, nunca `full`/`ultra`** — este CLAUDE.md já é rigoroso sobre o que não simplificar (ver "Complexidade deliberada"). Nível não persiste entre sessões — rodar `/ponytail lite` no começo de cada sessão nova.
- **Um épico por sessão.** Termine com `pnpm lint && pnpm test && pnpm build` verdes.
- **NENHUM resultado de gate é reportado sem `pnpm build` completo ter rodado.** Não basta `pnpm lint`/`typecheck` isolado: eles rodam a partir da RAIZ, mas o `next build` roda o próprio ESLint/typecheck com **cwd em `apps/<app>`** — caminho relativo de config resolve diferente, e um checador pode passar na raiz e explodir no build (ou o contrário). Aconteceu DUAS vezes: Épico 8 ("typecheck cobre a compilação" → o build provou que não) e Épico 9 ("0 falso positivo no `pnpm lint`" → o build expôs FP em massa do guarda de token). Mesma causa: **ferramenta rodando com cwd diferente da raiz.** Regra: só declare verde depois do `pnpm build`, e prefira caminho ABSOLUTO (`import.meta.dirname`) em qualquer config que uma ferramenta possa carregar de outro cwd.
- **Testes junto com a feature**, não depois. Cobertura mínima em módulos de negócio.
- **Contratos primeiro:** schema Prisma e schemas zod em `packages/contracts` antes da UI.
- **CI roda dois perfis:** "somente core" e "tudo ligado". Feature que quebra o perfil mínimo não passa.
- **Commits pequenos, imperativo em pt-BR** ("adiciona wizard de impressora", não "added printer wizard").
- **Nunca commite `.env.local`** nem credenciais. Se aparecer, revogue no provedor e limpe o histórico.
- **`*.e2e.test.ts` fica FORA do `pnpm test` padrão** (script `test:e2e` separado) — precisa de Redis/Postgres reais, é lento (rate limit com cooldown real chega a ~85s), e não é determinístico o bastante pra rodar em todo `pnpm build`. Roda `test:e2e` manualmente antes de commit que mexe em fluxo de auth. Cada arquivo e2e precisa limpar seu próprio rate-limit de IP no `beforeAll`.

## Ordem dos épicos

Ver tabela completa em `docs/01-plano-produto.md` §8. Sequência do MVP:

### Estado atual do Épico 9b — autenticação real do backoffice

Implementado na branch `codex/epico-9b-login-staff`, em revisão no PR #1. **Ainda não foi mesclado nem implantado.** A fonte detalhada é `docs/09b-auth-backoffice.md`; este resumo substitui o desenho histórico do item 9b abaixo quando houver divergência.

- `/login` consulta `GET /v1/auth/otp/config`, solicita e valida OTP de staff e seleciona o tenant quando o usuário tem mais de um vínculo.
- O access token fica somente em memória. O refresh token fica no cookie `__Host-molho_refresh`, com `HttpOnly`, `Secure`, `SameSite=Strict`, sem `Domain`, rotação a cada uso e revogação no logout. `sessionStorage` guarda apenas a preferência de tenant.
- O prefixo `__Host-` **exige `Path=/`**; portanto não pode coexistir com a antiga proposta de path restrito ao endpoint. `POST /v1/auth/refresh` e `POST /v1/auth/logout` exigem `X-Molho-Client: backoffice`, forçando preflight, além da allowlist CORS exata.
- `GET /v1/me/sessions/tenants` deriva tenants e lojas somente dos scopes do JWT verificado e usa IDs explícitos nas consultas.
- Chamadas autenticadas tentam um refresh e um retry após `401`. Refreshes concorrentes compartilham uma Promise na aba e usam `navigator.locks` entre abas para não acionar falsamente a detecção de reutilização.
- Todo `/gestor/*` passa pelo bootstrap autenticado; o stub `/dev-login` e seu replacement de build foram removidos. O SSE renova a sessão quando o token expira e rearma o stream.
- O logout avisa e tenta sincronizar a fila offline, executa `stream/disarm`, revoga a sessão remota e só então limpa a sessão local. Se a revogação remota falhar, não finge logout local completo.
- Gate padrão conferido: `pnpm lint`, `pnpm test` (API 415/415; backoffice 76/76) e `pnpm build` (6/6) verdes.
- **E2E real ainda não está verde:** rodadas de auth foram bloqueadas pelo `P2028` conhecido do Neon antes dos novos asserts. O cleanup do teste foi endurecido para nunca transformar `tenantId: undefined` em `deleteMany` global. Repetir `pnpm --filter @molho/api run test:e2e` com Neon estável antes do merge/deploy.
- Staging já possui as variáveis de OTP/e-mail/JWT/Redis/CORS na Fly e `NEXT_PUBLIC_API_URL=https://api.staging.molho.live` no backoffice. Depois do merge e deploy, validar no navegador OTP real, reload/refresh, tenant, SSE e remoção dos cookies no logout.

1. ✅ Scaffold + design system Tempero
2. ✅ Schema Prisma + RLS + registry de módulos + RBAC + seed
3. ✅ Auth OTP + sessões + revogação
4. ✅ CRUD de cardápio + upload R2 + importação por planilha
5. ✅ Storefront: menu, carrinho, bottom sheets
6. ✅ Endereços + zonas de entrega + horários
7. ✅ Checkout + pedidos + máquina de estados
8. ✅ Pagamento PIX estático + método (dinheiro/cartão na entrega) + troco + reconciliação manual. Fecha com o cliente pagando e ficando no escuro: o lojista confirma o pagamento, mas nada avisa o cliente (WhatsApp de status é o 11, página de acompanhamento é o 12). Mesma família de decisão do Épico 10: dá pra construir fora de ordem, mas o piloto não vai ao ar sem o 11 ou o 12 fechado. Contrato de gate de preparo/conclusão por método e limitação de reconciliação documentados em docs/02 §5.5, pro Épico 9 consumir.
9. Gestor de pedidos realtime + push/som + fila offline — **em andamento** (backend fechado; a remoção do stub e o login real estão no PR do 9b)
<!-- DESENHO HISTÓRICO: o texto longo do item 9b abaixo registra as decisões originais. O estado atual e as correções de implementação estão na seção acima. -->
9b. **Auth-do-backoffice (login diário de staff) — BURACO DE ROADMAP, bloqueante de go-live.** Descoberto no Épico 9: o backend de staff-auth existe (`/v1/auth/otp` request/verify, sessões, revogação — Épico 3), mas **não existe frontend de login de staff no backoffice** (é scaffold puro). Não é feature opcional — é como o lojista abre o sistema toda manhã, e não estava em nenhum épico (13 é onboarding do cadastro, 14 é super-admin). Escopo: tela de login OTP de staff, storage do token, client autenticado com header `X-Tenant-Id`, seletor de tenant pra staff multi-tenant, wiring do `arm`/`disarm` do stream (incluindo `disarm` ANTES de descartar o JWT, docs/07). **Decisão de storage do token (NÃO herdar o `sessionStorage` do stub por acidente):** o stub usa `sessionStorage` por conveniência de dev; pro 9b, recomendação é **access token em MEMÓRIA + refresh token em cookie `httpOnly`** — melhor resistência a XSS (XSS não exfiltra o refresh; access some no reload e é re-mintado via refresh) e casa com o padrão same-site do cookie de stream que já construímos. O cenário de tablet de balcão compartilhado (aba aberta o turno todo, staff trocando entre turnos) reforça isso: a fronteira real é o **logout explícito** (disarm + clear), não a persistência do storage — `localStorage` seria pior (auto-persiste a sessão do turno anterior pro próximo); `sessionStorage` só protege se alguém fechar a aba, o que num tablet de balcão não acontece. Pareia com o hardening de CSP (docs/07) — sem CSP, memória+httpOnly ainda é o teto de segurança viável. **Cuidado ao pegar o 9b — dois pontos que já custaram análise e não devem ser redescobertos:** (1) **o refresh em cookie `httpOnly` reintroduz cookie-como-credencial num endpoint de ESCRITA** (`/refresh` minta token novo). É a mesma categoria que fechamos ao manter toda escrita em JWT no header — então o cookie de refresh precisa do MESMO tratamento do cookie de stream: prefixo `__Host-`, sem `Domain`, `SameSite=Strict`, e `Path` restrito ao endpoint de refresh (não `/`). O 9b REUSA a análise de superfície same-site que já está no desenho do Épico 9 (docs/07 + histórico), não refaz do zero. (2) **Terminal compartilhado torna o RBAC decorativo — é decisão de PRODUTO, não de auth:** se a cozinha inteira opera um tablet logado como `owner`, a distinção owner/manager/cashier deixa de significar algo (qualquer um confirma pagamento, cancela pedido), e TTL curto de token NÃO resolve. A resposta padrão de PDV é **bloqueio por inatividade + PIN por operador**. Questão ABERTA pro 9b (decidir no escopo dele; o piloto pode revelar se importa de verdade). (3) **Intents órfãos da fila offline no logout (Épico 9):** a fila vive em `localStorage` por tenant e sobrevive à sessão (`sessionStorage`). Decisão: os intents FICAM e são processados no **sync do próximo login** daquele tenant — intent de outro usuário vai pra bandeja identificado, intent velho (>TTL) idem. O logout do 9b DEVE **avisar se houver fila pendente e tentar sincronizar antes de sair** (não deixar o operador sair achando que aplicou algo que só está enfileirado). O `disarm` (limpar o cookie de stream) roda de qualquer forma, ANTES de descartar o JWT. **Posição sugerida:** antes do 13 (onboarding cria o owner, que precisa logar) e do 14; na prática é fundação de todo backoffice autenticado. O Épico 9 usa um stub só-dev que obtém JWT REAL pelo `/v1/auth/otp` (atalho pro token, nunca contorno da validação) até este épico entrar. Não implementado — só escopo e posição.
9c. **RECOMENDAÇÃO DE PM: subir o ambiente real na Fly LOGO DEPOIS do Épico 9, antes do 10** (domínio `molho.live` + migração do Neon pra sa-east-1 + Upstash SP + duas máquinas Fly GRU). **Argumento:** o checklist de go-live está virando o lugar onde o RISCO se acumula — fronteira cookie/CORS (não validável em dev), pub/sub Redis cross-instância (Upstash deu ETIMEDOUT local, docs/07), CSP, disarm no logout, 9b — tudo esperando um deploy que não existe, e CADA épico empilha mais. Um ambiente real **colapsa metade do checklist de uma vez**, e validar o desenho de cookie/CORS mais cedo é MUITO mais barato que descobrir um problema com 5 épicos empilhados em cima dele. Não é código de feature — é infra que destrava validação. Decisão de sequenciamento do PM.
11. WhatsApp click-to-chat + `notification_log` (nenhum dos dois existe hoje — a porta `ClickToChatProvider` é citada no comentário de `messaging-provider.port.ts` mas NÃO está definida, e a tabela `notification_log` não está no schema; ambos são escopo DESTE épico, não buraco)
12. Página de acompanhamento — **polling, NÃO SSE. Motivo (não só a decisão): assimetria de volume.** O gestor são dezenas de conexões de STAFF por loja; o acompanhamento são MILHARES de consumidores simultâneos. A conta de conexão que fizemos pro SSE do gestor (~1–2k por máquina 512MB) **não se transfere** — manter milhares de SSE de consumidor abertos é outra ordem de grandeza de custo. Polling é a escolha certa aqui, e é deliberada. Ninguém "otimiza" isso pra SSE depois sem REFAZER a conta de volume.
13. Onboarding self-service (wizard 7 passos) — **depende do 9b** (owner criado precisa logar)
12. Página de acompanhamento
13. Onboarding self-service (wizard 7 passos)
13b. 4 templates de tema + logo/capa
13d. Assinatura, trial, dunning — **DEPENDÊNCIA EXTERNA COM LEAD TIME, começar em PARALELO com os épicos 9–12, não quando chegarmos no 13.** O pagamento do MVP é PIX estático MANUAL (mock/sem PSP, Épico 8); cobrança recorrente de assinatura (cartão recorrente ou PIX assinatura) precisa de PSP REAL. **É o único item do roadmap cujo prazo NÃO depende de nós:** abrir conta em PSP no Brasil exige CNPJ, contrato, KYC/underwriting e aprovação sandbox→produção — semanas de calendário que NÃO comprimem com velocidade de código (todo o resto do roadmap é tempo de dev que controlamos). Iniciar a abertura de conta já, em paralelo. Levantamento de PSPs em `docs/07` (§ PSP recorrente). **Alternativa de sequenciamento que tira o PSP do caminho crítico:** o piloto (punhado de restaurantes) pode ser **cobrado manualmente** (PIX/boleto na mão); o billing self-service vira o 13d "de verdade" só com volume. Isso desacopla o go-live da dependência externa — decisão de PM.
14. Super-admin (provisionamento, módulos, entitlements, impersonation)
10. Impressão ESC/POS + agente local + wizard — **reposicionado pro fim da Fase 1** (depois do 13d/14, antes do go-live); piloto vai ao ar sem comanda impressa, operando por tela (docs/01 §8 tem o racional e a condição de antecipação)
— **GO-LIVE do piloto** —
15+. Fases 2–4 (ver plano)

## Segurança

- **Rate limit no OTP** (`OtpService`): sliding window real (sorted set no Redis) — 5 pedidos/hora por telefone + cooldown 60s, 20/hora por IP, 3 tentativas de verificação. Código via `crypto.randomInt` (nunca `Math.random`), TTL 10min, HMAC-SHA256 no Redis. `scope` (`staff`/`customer:{tenantSlug}`) namespacea o desafio.
- Rate limit no storefront público (evita scraping de preço).
- Segredos só em env vars. Nunca em código.
- 2FA na Vercel, Neon e Cloudflare.
- **Telefone é sempre `PhoneNumber`** (`packages/contracts/phone-number.ts`), nunca string bruta — normaliza qualquer formato BR pra E.164, valida DDD real + nono dígito. `MessagingProvider.send()` só aceita esse tipo; guard converte antes de qualquer service ver o telefone.
- **Guardrail de custo do SMS (Zenvia):** cada SMS é ~R$ 0,15. `ZenviaSmsProvider` tem teto diário (`MOLHO_MAX_SMS_PER_DAY`) contado no Redis. Estourou: loga CRITICAL e **nega o login** — **nunca cai pro `MockMessagingProvider`** em produção.

## Complexidade deliberada — não simplificar

- **RLS no Postgres além do filtro de aplicação** — não confia no ORM: um `WHERE` esquecido em query nova não vaza dado de outro tenant, o banco nega por padrão.
- **FKs compostas `(id, tenant_id)`** — guardrail do `tenant_id` denormalizado: impede fisicamente uma linha filha apontar pra um pai de OUTRO tenant, mesmo com bug de aplicação.
- **Colunas de snapshot em `orders`** (endereço, nome/preço de item) em vez de JOIN vivo — o pedido não muda de valor se o produto ou endereço salvo forem editados depois; é o que o cliente pagou, congelado no tempo.
- **`order_status_history` separada do `audit_log` genérico** — consulta "linha do tempo deste pedido" indexada por `order_id`, sem vasculhar JSON de compliance da plataforma inteira.
- **`version` pra optimistic locking** — duas edições concorrentes na mesma linha não se sobrescrevem silenciosamente; a perdedora recebe 409, não dado corrompido.
- **Portão de contraste real no Chromium via Playwright** — mede contraste renderizado de verdade, não confia em cálculo estático que pode divergir do que o navegador realmente pinta.
- **`SELECT ... FOR UPDATE` nas linhas de produto na criação do pedido** — fecha a janela de corrida em preço/disponibilidade sob READ COMMITTED que anularia a tela de confirmação obrigatória (regra 14).
- **Índices únicos parciais `WHERE deleted_at IS NULL`** — soft delete nunca trava um valor (slug, telefone) pra sempre; sem o parcial, o registro apagado impediria recriar o mesmo valor.
- **Erros distinguíveis por natureza** (`RateLimited` vs `QuotaExceeded`, `CatalogNotFoundError` vs `CatalogConflictError`, etc.) — cada um vira uma resposta HTTP e uma decisão de UI diferente; colapsar em `Error` genérico obrigaria checar `.message` por substring, frágil e silenciosamente quebradiço.

Um agente ou revisor operando sob YAGNI vai sinalizar estes itens como excesso. Eles são decisões conscientes de segurança e integridade — qualquer proposta de removê-los exige aprovação explícita do PM.

---

Sempre que uma decisão de arquitetura tiver mais de um caminho razoável, explique-a em uma frase antes de codar, e escolha o mais simples que atende às regras acima.
