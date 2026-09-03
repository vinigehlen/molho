# Handoff para o Codex — Épicos 11, 12 e 13 (trabalho noturno paralelo)

Data: 2026-09-02
Autor: sessão Claude Code (branch `epico-16b-cashback` em andamento)

## Por que este handoff existe

Há trabalho ativo em paralelo que **não pode ser tocado**:

- **Épico 16b — cashback/loyalty** (`epico-16b-cashback`, em andamento agora): mexe em
  `createOrder`, na máquina de estados de conclusão do pedido, no `cart-view.tsx`
  (toggle "usar meu saldo") e nas tabelas `loyalty_*` + colunas novas em `orders`
  (`cashback_used_cents`).
- **Épico 9b — auth do backoffice** (`codex/epico-9b-login-staff`, PR aberto, não
  mesclado): todo o bootstrap autenticado de `/gestor/*`, cookie de refresh,
  seletor de tenant.

Os três épicos abaixo foram escolhidos porque **não colidem** com nenhum dos dois:
áreas de código disjuntas, e as migrations são aditivas/idempotentes. São **três
PRs independentes** — podem ser feitos em qualquer ordem, mas a sequência sugerida
é **12 → 11 → 13** (11 anota a página que o 12 cria; 13 é o maior e é
100% isolado, pode começar a qualquer momento).

## Antes de tocar em qualquer arquivo

1. Ler `AGENTS.md` inteiro (primeira instrução ativa em sessão Codex) e `CLAUDE.md`
   — regras não-negociáveis (com destaque pras **regras 6, 12, 13, 15**),
   convenções de schema Postgres, seção "Complexidade deliberada".
2. Ler `docs/07-aprendizados.md` antes de mexer em migration, build ou teste.
3. Gate de todo PR: `pnpm lint && pnpm test && pnpm build` **verdes — build
   completo**, não só typecheck isolado (CLAUDE.md explica por quê).
4. Contratos primeiro: schema Prisma + zod em `packages/contracts` antes da UI.
5. Commits pequenos, imperativo em pt-BR ("adiciona página de acompanhamento", não
   "add tracking page"). Um épico por PR.
6. Toda migration com SQL à mão é **idempotente** (`IF NOT EXISTS`, `CREATE OR
   REPLACE`, `DROP POLICY IF EXISTS`+`CREATE`). Fluxo: `prisma migrate dev
   --create-only` → editar `migration.sql` → `prisma migrate deploy` → `prisma
   generate`. Nunca `prisma migrate dev` liso (trava esperando stdin).
7. Índice único parcial **nunca** vem do `schema.prisma` — SQL à mão na migration,
   comentário no model.
8. Definition of Done de todo épico (CLAUDE.md): módulo no registry + gate no
   backend (`@RequireModule` + `@RequirePermission`) + gate no front (`<Gate>`) +
   suíte "somente core" verde.

## Coordenação de migrations (importante)

Quatro migrations vão nascer em paralelo (cashback já tem a dela; +11, +12, +13).
Todas aditivas e idempotentes. No merge, se dois timestamps colidirem, **renomeie
o prefixo da sua** pra depois da que já está no `main` — nunca edite migration de
outra pessoa. Nenhuma das quatro dropa coluna, então a ordem de aplicação real
não muda o resultado.

---

## Épico 12 — Página de acompanhamento do pedido

**Fase 1 · bloqueante de go-live · storefront + 1 endpoint público de leitura.**

### Estado atual

- `cart-view.tsx` (tela de sucesso do checkout) tem um TODO literal na linha ~145:
  *"Épico 12 (acompanhamento) ainda não…"*. É o ponto de wiring do link.
- `POST /v1/store/:slug/checkout/orders` (`checkout.controller.ts:80`) responde hoje
  com `result.response` contendo `orderId`. Precisa passar a devolver **também o
  token de acompanhamento**.
- Componente `packages/ui/src/components/mo-timeline.tsx` já existe — timeline
  vertical com dots animados. Reusar, não recriar.
- `apps/storefront/app/[slug]/minha-conta/` (Épico 12b) já lista pedidos **do
  cliente logado**. Isso **não** substitui o Épico 12: pedido guest não tem sessão
  (CLAUDE.md regra 13), então o acesso é **só por link não-adivinhável**.

### Decisão de arquitetura (uma frase)

Acompanhamento é **polling, nunca SSE** (CLAUDE.md/docs/01 §8 — assimetria de
volume: gestor são dezenas de conexões de staff, acompanhamento são milhares de
consumidores; a conta de conexão do SSE do gestor não se transfere). Acesso por
**token opaco por pedido**, não por `orderId` nem por "meus pedidos".

### Schema

Migration aditiva em `orders`:

- `tracking_token uuid NOT NULL DEFAULT gen_random_uuid()` — coluna nova, `@unique`
  (índice único parcial `WHERE deleted_at IS NULL` na migration, SQL à mão).
  `gen_random_uuid()` (v4, 122 bits de aleatoriedade) é não-adivinhável — **não**
  adicionar dependência de nanoid.
- Backfill: o `DEFAULT` já cobre linhas existentes no momento do `ADD COLUMN`.
- Comentário no model `Order` explicando o índice parcial.

### Contracts

- Schema zod do payload público de acompanhamento em `packages/contracts` — só o
  que o cliente pode ver: status atual, timeline (de `order_status_history`,
  filtrada — sem `actor_id`/`actor_role`/`reason` interno), itens (nome +
  quantidade, do snapshot do pedido), total, tipo de fulfillment,
  `fulfillment_deadline_at`, `canceled_reason` (é público de propósito, ver
  comentário no schema). **Nunca** telefone, endereço completo, dados de staff.
- Microcopy em `packages/contracts/src/copy.pt-BR.ts` sob `COPY.cliente` (bloco
  `acompanhamento`), pt-BR informal, **sem emoji** (§2 do doc de marca).

### API

- `GET /v1/store/:slug/track/:token` — **público, anônimo, sem guard de auth**.
  - Rate limit por IP em **middleware** (mesmo padrão de
    `CheckoutOrderRateLimitMiddleware` / `GeocodeIpRateLimitMiddleware`), ordenado
    antes de qualquer I/O. É superfície pública de alto volume.
  - Token inválido/não encontrado → 404 genérico (`COPY.cliente.erros` já tem
    `naoEncontrado`), **nunca** distinguir "não existe" de "existe mas token
    errado".
  - Leitura tenant-scoped normal via `RequestContextService` (o `:slug` resolve o
    tenant; RLS cobre o resto). **Sem I/O externo dentro do `run()`** (CLAUDE.md).
  - `checkout.controller.ts` `createOrder`: incluir `trackingToken` no
    `result.response` (ajustar o tipo de retorno do `orderService.createOrder` e o
    schema de resposta em contracts).

### Frontend (`apps/storefront`)

- Rota nova: `app/[slug]/acompanhar/[token]/page.tsx` (+ `loading.tsx` com
  skeleton). Server component que faz o fetch inicial; um client component filho
  faz o **polling** (intervalo ~15–20s; parar o polling em status terminal —
  `completed`/`canceled`/`delivery_failed`/`expired`/`auto_canceled`).
- Usar `<MoTimeline>` pros dots de status. Estados infelizes (cancelado) com
  tratamento visual próprio + `canceled_reason`.
- `cart-view.tsx` tela de sucesso: trocar o TODO por um `<MoButton>` "Acompanhar
  pedido" → `router.push(\`/${slug}/acompanhar/${trackingToken}\`)`. Manter o
  `#{orderId.slice(0,8)}` como está.
- Gate: `<Gate module="channel.storefront">` (já é `default: true`). Não precisa
  de módulo novo — acompanhamento é parte do canal storefront.

### Conflito com o trabalho em voo

- `cart-view.tsx` **também** é tocado pelo 16b (toggle de cashback). Mudança do 12
  ali é pequena e localizada na função `SuccessScreen` (linha ~131). Se o 16b
  mesclar antes, rebase trivial. Fazer a mudança do 12 o mais cirúrgica possível.
- `orders` ganha coluna nova — sem overlap com `cashback_used_cents` do 16b além
  do timestamp da migration (ver "Coordenação de migrations").

### DoD

- Pedido criado no storefront → tela de sucesso mostra "Acompanhar pedido" →
  abre a página → status e timeline corretos → muda de status no gestor → a
  página reflete no próximo poll.
- Token errado → 404 pt-BR.
- Nenhum dado de staff/PII no payload (teste explícito).
- `pnpm lint && pnpm test && pnpm build` verdes.

---

## Épico 11 — WhatsApp click-to-chat + `notification_log`

**Fase 1 · bloqueante de go-live · backoffice (gestor) + 1 tabela + endpoint.**

### Estado atual — leia com atenção, muita coisa já existe

- **Módulo `notify.whatsapp_ctc`** já está no registry (`packages/contracts/src/modules.ts`),
  `plans: PLANS, default: true`.
- **A UI de click-to-chat já existe e está pronta:**
  - `apps/backoffice/lib/whatsapp.ts` — `whatsappMessage(order)`, `orderSummary()`,
    `waMeUrl(phone, text)`, templates espelhados de `COPY.whatsapp`.
  - `apps/backoffice/app/gestor/whatsapp-sheet.tsx` — o bottom sheet que o lojista
    usa pra editar e disparar o `wa.me`.
  - `GET /v1/admin/orders/:id/customer-phone` (`order-admin.controller.ts:81`) já
    entrega o telefone decifrado.
- **Decisão já travada (não re-decidir):** **NÃO** existe porta `ClickToChatProvider`.
  O comentário em `messaging-provider.port.ts` menciona a porta como conceito, mas
  a decisão registrada em `whatsapp.ts` é explícita: *"uma URL montada na UI não
  justifica uma abstração com uma implementação só"*. A porta `ClickToChatProvider`
  citada no CLAUDE.md/roadmap **fica como não-feita de propósito**. Se você acha que
  precisa dela, pare e peça aprovação do PM — não construa.

### O que falta (o escopo real do Épico 11)

1. **Tabela `notification_log`** (append-only) — registra que o lojista disparou
   um aviso de status pra um pedido. É o "esse cliente foi avisado?" que hoje não
   tem resposta no banco.
2. **Endpoint** que grava a linha quando o lojista confirma o envio no sheet.
3. **Feedback visual** no `order-card` / `whatsapp-sheet`: "cliente avisado às
   HH:MM" (lê de `notification_log`).
4. **Gate** `@RequireModule('notify.whatsapp_ctc')` no endpoint + `<Gate
   module="notify.whatsapp_ctc">` no botão do sheet.
5. (Opcional, se o Épico 12 já tiver mesclado) mostrar "última atualização enviada
   pelo restaurante" na página de acompanhamento.

### Decisão de arquitetura (uma frase)

O Molho **nunca** envia a mensagem (CLAUDE.md regra 6) — o `notification_log`
registra a **intenção confirmada pelo humano** ("lojista clicou em 'já enviei'"),
não uma entrega. É log de auditoria/UX, não comprovante.

### Schema

Model novo `NotificationLog` — **append-only** (sem `deleted_at`, sem `version`,
como `audit_log`/`module_audit`/`order_status_history`):

```
model NotificationLog {
  id         String   @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId   String   @map("tenant_id") @db.Uuid
  orderId    String   @map("order_id") @db.Uuid
  channel    String   // "whatsapp_ctc" — TEXT, não enum (mesmo padrão de module_key)
  orderStatusSnapshot OrderStatus @map("order_status_snapshot") // status do pedido no momento do aviso
  actorId    String   @map("actor_id") @db.Uuid   // staff que confirmou (FK simples users(id) — users não tem tenant_id)
  actorRole  String   @map("actor_role")
  createdAt  DateTime @default(now()) @map("created_at")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  order  Order  @relation(fields: [orderId], references: [id])
  actor  User   @relation(fields: [actorId], references: [id])

  @@index([tenantId, orderId, createdAt])
  @@map("notification_log")
}
```

- FK composta `(order_id, tenant_id) → orders(id, tenant_id)` na migration (SQL à
  mão — mesma convenção de `order_status_history`).
- RLS: policy `app_tenant_visible(tenant_id)` como toda tabela tenant-scoped.
  Append-only → policy permite INSERT/SELECT, nunca UPDATE/DELETE no runtime.
- Adicionar a relação `notificationLogs NotificationLog[]` em `Tenant`, `Order`, `User`.

### Contracts

- Schema zod do request (`POST` body: nada além do implícito na rota — o status
  vem do estado atual do pedido no servidor, **não** do cliente) e da linha
  retornada.
- Nada de telefone no contrato (CLAUDE.md regra 13 — `customer.phone` fica fora de
  schema compartilhado).

### API

- `POST /v1/admin/orders/:id/notifications` — grava uma linha em `notification_log`
  com o status **atual** do pedido (lido do banco, nunca do body), o ator do JWT e
  o papel. `@RequireModule('notify.whatsapp_ctc')` + `@RequirePermission` (usar a
  permission de operar pedidos que o gestor já exige — conferir
  `packages/contracts/permissions.ts`, provavelmente `orders.manage` ou
  equivalente).
- `GET /v1/admin/orders/:id` (`order-admin.controller.ts:64`) ou a listagem do
  board: incluir `lastNotifiedAt` / `notificationCount` derivado de
  `notification_log` pra UI mostrar o estado sem uma request por card.
- Transação via `RequestContextService`, sem I/O externo dentro do `run()`.

### Frontend (`apps/backoffice`)

- `whatsapp-sheet.tsx`: depois que o lojista toca no botão que abre o `wa.me`
  (ou num "já enviei" explícito — decidir qual é a UX menos atritante; sugestão:
  o próprio ato de abrir o `wa.me` dispara o `POST`, já que é a ação real),
  chamar `POST .../notifications` e atualizar o estado local.
- `order-card.tsx`: badge/linha "Cliente avisado às HH:MM" quando
  `lastNotifiedAt` existe.
- `<Gate module="notify.whatsapp_ctc" fallback={null}>` em volta do botão de aviso.
- Microcopy: templates de mensagem já estão em `whatsapp.ts` e espelham
  `COPY.whatsapp` — se mexer numa, mexer na outra (o teste de léxico varre
  `contracts`).

### Conflito com o trabalho em voo

- `whatsapp-sheet.tsx` e `order-card.tsx` **não** são tocados pelo 16b nem pelo 9b.
- `order-admin.controller.ts` / listagem do board: o 9b mexe em auth/bootstrap do
  gestor, não nos controllers de pedido. Baixo risco; se colidir, é no
  `@UseGuards` do controller — rebase trivial.
- Migration nova, aditiva.

### DoD

- Lojista dispara aviso pelo sheet → linha em `notification_log` com status e ator
  corretos → card mostra "avisado às HH:MM".
- Endpoint nega sem o módulo `notify.whatsapp_ctc` (teste do perfil "somente core"
  vs "tudo ligado").
- Tabela é append-only de verdade (teste: runtime não consegue UPDATE/DELETE).
- Nenhum telefone em log ou em response de contrato compartilhado.
- `pnpm lint && pnpm test && pnpm build` verdes.

---

## Épico 13 — Onboarding self-service (melhorias P0 com migration)

**Fase 1 · bloqueante de go-live · backoffice (`/gestor/configuracao`) + `/signup` +
API de setup + migration.**

### Estado atual — a base já foi mesclada no `main`

`docs/13-onboarding-self-setup-benchmark.md` → seção "Implementado nesta rodada".
Já existe e está no `main`:

- `apps/backoffice/app/signup/` + `apps/backoffice/lib/signup-api.ts` — cadastro
  por OTP, cria tenant/owner/loja, redireciona pra `/gestor/configuracao`.
- `apps/backoffice/app/gestor/configuracao/page.tsx` — wizard operacional de
  publicação (loja, horários via `StoreHours`, cardápio manual, zona de entrega,
  PIX, checklist de publicação).
- `Tenant.cnpj` e `users.name` persistidos pela API de setup.

> A branch `codex/epico-13-onboarding` **não tem commits à frente do `main`** — o
> trabalho dela já foi incorporado (ver commit `dc22934 "merge: incorpora
> fechamento do onboarding"` e `832af1a`). Você **continua** o épico a partir do
> `main`, não reabre a branch antiga.

### O que falta (escopo desta rodada)

A lista **"Próximas melhorias P0 com migration"** de `docs/13`. São de MVP mas
exigem evolução de schema. Priorizar nesta ordem (todas aditivas):

1. **Endereço estruturado da loja** em `Store`: `postal_code`, `street`, `number`,
   `neighborhood`, `city`, `state`, `complement`, `reference_point` — hoje só
   existe `address_text` (texto livre). Manter `address_text` como fallback/legado
   (não dropar). Reusar o `GeocodeMiddleware` / `apps/api/src/geo/` já existente
   pra derivar `geo` do CEP (mesmo padrão do Épico 6, **fora** do
   `RequestContextService.run()`).
2. **Razão social separada do nome fantasia** + **inscrição estadual opcional** +
   **descrição pública da loja** em `Store` (ou `Tenant`, o que casar com o modelo
   atual — conferir onde `name`/`slug` vivem).
3. **Logo e capa da loja**: colunas de URL em `Store` (ou `Tenant`), upload via URL
   presignada R2 (mesmo fluxo de `ProductImage` que o wizard já usa pra foto de
   produto). **Não** é o Épico 13b (4 templates de tema) — 13b é decisão de tema/cor,
   isto é só o asset de logo/capa que o P0 de `docs/13` pede.
4. **Dados estruturados do responsável**: CPF opcional, telefone e e-mail
   financeiro **cifrados** (LGPD — AES-256-GCM via `MOLHO_ENCRYPTION_KEYS`,
   `*_lookup_hash` só se precisar buscar; e-mail segue política de `MOLHO_EMAIL_PEPPER`).
   Se não houver busca por esses campos, cifra sem hash. Nunca em claro, nunca em log.
5. **Edição completa de produto no wizard** (hoje só criação) + **edição de
   categoria** (descrição, visibilidade, ordenação por arrastar) — pode ser um
   segundo PR se o primeiro (schema de loja) ficar grande.
6. **Foto por variação/adicional** (`Modifier`) — coluna de URL, upload presignado.
7. **Disponibilidade por categoria/produto por dia e horário** — só se sobrar
   tempo; é o item mais pesado da lista, pode virar PR próprio ou ficar pra
   próxima rodada.

### Decisão de arquitetura (uma frase)

Tudo aditivo e **expand-only** (CLAUDE.md / `docs/04c` — nada de contração
destrutiva): colunas novas nullable, campos de texto livre antigos ficam como
fallback, nenhum `DROP COLUMN`.

### Schema

- Migration única cobrindo os itens 1–4 (endereço estruturado, razão social/IE/
  descrição, logo/capa, responsável cifrado). Itens 5–7 em migration(s)
  separada(s) se virarem PRs próprios.
- Todo campo novo **nullable** (loja já publicada não pode quebrar).
- `UNIQUE` que interaja com soft delete → índice único parcial `WHERE deleted_at
  IS NULL` (SQL à mão). Provavelmente nenhum aqui, mas conferir.
- Comentário em cada campo novo explicando por que existe (padrão do schema atual).

### Contracts

- Estender os schemas zod de setup/loja em `packages/contracts` **antes** da UI.
- Dinheiro em centavos (não há valor monetário novo aqui, mas o teto de zona já
  segue isso).
- Telefone sempre `PhoneNumber` (`packages/contracts/phone-number.ts`), nunca
  string bruta — vale pro telefone do responsável também.

### API

- Estender a API de setup (`apps/api/src/` — procurar o controller que
  `signup-api.ts` e o wizard consomem; provavelmente `v1/setup/*` ou
  `v1/stores/*`).
- Upload de logo/capa: endpoint de URL presignada R2 já existe pro catálogo —
  reusar, não recriar.
- Geocoding do endereço estruturado: `GeocodeMiddleware`, **fora** da transação.
- Auditoria: mudança de dados de loja/responsável é ação sensível? Se envolver
  CNPJ/PIX/dados fiscais, gravar em `audit_log` (CLAUDE.md regra 9). Conferir o
  que o setup atual já audita e seguir o padrão.

### Frontend (`apps/backoffice`)

- `app/gestor/configuracao/page.tsx` — adicionar os campos novos nos passos
  correspondentes do wizard (Passo 1 "Sua loja": endereço estruturado, razão
  social, IE, descrição; Passo 6 "Sua marca": logo/capa — **sem** seletor de cor
  livre, isso é 13b).
- Autosave + checklist de publicação já existem — os campos novos entram na mesma
  mecânica. Campos de logo/capa são "— (tem default)", não obrigatórios pra
  publicar (docs/03 §3).
- Gate: onboarding é core (`catalog`/`orders`/`customers` + `delivery.zones` +
  `payments.pix_static`, todos default). Sem módulo novo.

### Conflito com o trabalho em voo

- `/gestor/configuracao` e `/signup` **não** são tocados pelo 16b nem pelo 9b.
- `Store`/`Tenant`/`Modifier` ganham colunas — sem overlap com `loyalty_*` e
  `orders` do 16b.
- 9b mexe no bootstrap autenticado de `/gestor/*` — o wizard `configuracao` roda
  **dentro** desse bootstrap. Se o 9b mesclar primeiro, o wizard passa a assumir
  sessão real em vez do stub; nenhuma mudança de código do 13 depende disso (o
  wizard já usa o client autenticado). Baixo risco.
- Migration nova, aditiva.

### DoD

- `docs/13` "Critérios de aceite" continuam válidos + os campos novos persistem e
  recarregam no wizard.
- `/gestor/configuracao` responde 200.
- Dados do responsável cifrados em repouso (teste: coluna não tem texto claro).
- Valores em centavos.
- Funcionalidades fora do MVP continuam gateadas, não parcialmente ligadas.
- `pnpm lint && pnpm test && pnpm build` verdes.

---

## Resumo — o que entregar

| PR | Épico | Migration | Áreas |
| --- | --- | --- | --- |
| 1 | 12 — acompanhamento | `orders.tracking_token` | storefront (rota nova) + 1 GET público + `cart-view` (1 botão) |
| 2 | 11 — notification_log | tabela `notification_log` | backoffice gestor (sheet/card) + 1 POST + derivado no GET |
| 3 | 13 — onboarding P0 | `Store`/`Tenant`/`Modifier` colunas | backoffice `configuracao` + API setup |

Três PRs independentes. Sequência sugerida 12 → 11 → 13. Nenhum toca
`createOrder`/máquina de estados/`loyalty_*` (16b) nem o bootstrap de auth (9b).
Coordenar só o prefixo de timestamp das migrations no merge.
