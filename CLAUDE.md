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
- **Neon:** Postgres (URL em `.env.local`)
- **Upstash:** Redis (URL em `.env.local`)
- **Cloudflare R2:** bucket `molho-uploads` (credenciais em `.env.local`)
- **Resend:** e-mail transacional

No dev, cada tenant é servido em rota: `molho.vercel.app/{slug}`. Em produção futura será `{slug}.molho.store` (a lógica de resolução de tenant deve ser configurável para trocar sem refactor).

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
13. **Endereço do cliente é anônimo até o checkout.** Durante a navegação, o endereço em uso vive só no `localStorage` (mesmo padrão do carrinho, `packages/contracts/src/cart.ts`) — forçar OTP só pra checar cobertura de entrega queimaria SMS à toa. A tabela `addresses` existe desde o Épico 6 (tenant-scoped, RLS) mas fica **vazia** até o OTP do checkout gravar a linha. **OTP só é pedido no "Fazer pedido" final** — identidade real só é necessária quando o pedido precisa ser vinculado a um `customer`.
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
- **Telefone (LGPD):** nunca em claro. Cifra na aplicação (AES-256-GCM, `MOLHO_ENCRYPTION_KEYS`) + `phone_lookup_hash` (HMAC) pra busca por OTP. `phone_key_version` permite rotação sem migration em massa.
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
- **Testes junto com a feature**, não depois. Cobertura mínima em módulos de negócio.
- **Contratos primeiro:** schema Prisma e schemas zod em `packages/contracts` antes da UI.
- **CI roda dois perfis:** "somente core" e "tudo ligado". Feature que quebra o perfil mínimo não passa.
- **Commits pequenos, imperativo em pt-BR** ("adiciona wizard de impressora", não "added printer wizard").
- **Nunca commite `.env.local`** nem credenciais. Se aparecer, revogue no provedor e limpe o histórico.
- **`*.e2e.test.ts` fica FORA do `pnpm test` padrão** (script `test:e2e` separado) — precisa de Redis/Postgres reais, é lento (rate limit com cooldown real chega a ~85s), e não é determinístico o bastante pra rodar em todo `pnpm build`. Roda `test:e2e` manualmente antes de commit que mexe em fluxo de auth. Cada arquivo e2e precisa limpar seu próprio rate-limit de IP no `beforeAll`.

## Ordem dos épicos

Ver tabela completa em `docs/01-plano-produto.md` §8. Sequência do MVP:

1. ✅ Scaffold + design system Tempero
2. ✅ Schema Prisma + RLS + registry de módulos + RBAC + seed
3. ✅ Auth OTP + sessões + revogação
4. ✅ CRUD de cardápio + upload R2 + importação por planilha
5. ✅ Storefront: menu, carrinho, bottom sheets
6. ✅ Endereços + zonas de entrega + horários
7. ✅ Checkout + pedidos + máquina de estados
8. Pagamento PIX estático + reconciliação manual — **próximo**. Fecha com o cliente pagando e ficando no escuro: o lojista confirma o pagamento, mas nada avisa o cliente (WhatsApp de status é o 11, página de acompanhamento é o 12). Mesma família de decisão do Épico 10: dá pra construir fora de ordem, mas o piloto não vai ao ar sem o 11 ou o 12 fechado.
9. Gestor de pedidos realtime + push/som + fila offline
11. WhatsApp click-to-chat + `notification_log`
12. Página de acompanhamento
13. Onboarding self-service (wizard 7 passos)
13b. 4 templates de tema + logo/capa
13d. Assinatura, trial, dunning
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
