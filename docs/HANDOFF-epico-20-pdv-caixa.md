# Handoff — Épico 20 (PDV completo + caixa)

Data: 2026-09-14
Autor: sessão Claude Code (planejamento, aval do PM em conversa — ver decisões abaixo)

## Por que este épico existe

`docs/01-plano-produto.md` §8 marcava PDV+caixa como "não iniciado — balcão cobre
parte". O balcão (`apps/api/src/orders/counter-order.controller.ts`) cria pedido
walk-in **já pago e já entregue** direto, sem sessão de caixa, sem rastrear quem
operou o dinheiro nem bater conferência no fim do turno. Este épico fecha essa
lacuna: sessão de caixa (abrir/fechar/sangria), vinculada ao operador, obrigatória
pra vender no balcão, com corte na análise (analytics).

## Decisões já fechadas (não reabrir sem novo aval)

1. **Sessão obrigatória.** Sem caixa aberto, `POST /counter-orders` recusa (novo
   erro de domínio, não 500).
2. **Prompt de abertura bloqueante.** UI do backoffice mostra modal obrigatório de
   abrir caixa na primeira ação do dia / ao sair de inatividade — antes de
   qualquer tela do balcão ficar utilizável.
3. **Uma sessão por loja.** Não é por operador — se o turno trocar de pessoa sem
   fechar/abrir, quem sangra/fecha registra o `actorId` de quem fez a ação, mas a
   sessão em si continua sendo "a sessão aberta da loja".
4. **`operator_id` registrado em toda ação** (abertura, fechamento, sangria) —
   nunca assume que quem abriu é quem fecha.
5. **Sangria com aprovação de manager (PIN in-app).** Mesmo padrão dos outros
   fluxos `approval: true` da seção 5-C.6 do plano (desconto manual, cancelamento
   de pedido pago) — não fica pra depois.
6. **Sem tiering de plano.** `pdv` e `cash_register` nascem `default: true` em
   `PLANS` completo no registry, mesmo padrão que coupons/combos/loyalty/reviews
   já receberam (decisão do PM 2026-09-02/03). Controle fica em feature-flag de
   super-admin **quando o painel existir**; até lá, todo tenant nasce com o
   módulo ligado.
7. **Balcão migra pro gate `RequireModule('pdv')`.** Hoje só tem
   `RequireModule('orders')` (core). Como o módulo nasce ligado em todo tenant
   (decisão 6), isso não tranca ninguém que já usa balcão hoje — é só a forma
   correta de expressar a dependência no registry.
8. **Analytics ganha corte de venda em dinheiro por sessão/operador** — novo
   endpoint ou extensão do `AnalyticsController`, mesmo padrão do `CmvController`
   (`@RequireModule('analytics.cmv')` → aqui seria algo como
   `@RequireModule('cash_register')`).

## Antes de tocar em qualquer arquivo

1. Ler `AGENTS.md` e `CLAUDE.md` inteiros — regras não-negociáveis, convenções de
   schema Postgres, seção "Complexidade deliberada".
2. Ler `docs/07-aprendizados.md` antes de migration, build ou teste.
3. Gate de todo PR: `pnpm lint && pnpm test && pnpm build` verdes — build
   completo, não só typecheck isolado.
4. Contratos primeiro: schema Prisma + zod em `packages/contracts` antes da UI.
5. Migration com SQL à mão é **idempotente** (`IF NOT EXISTS`, `CREATE OR
   REPLACE`, `DROP POLICY IF EXISTS`+`CREATE`). Fluxo: `prisma migrate dev
   --create-only` → editar `migration.sql` → `prisma migrate deploy` → `prisma
   generate`. Nunca `prisma migrate dev` liso.
6. Definition of Done (CLAUDE.md): módulo no registry + gate no backend
   (`@RequireModule` + `@RequirePermission`) + gate no front (`<Gate>`) + suíte
   "somente core" verde.
7. `apps/api/src/orders/*` e migrations de `orders` são área sensível
   (`docs/release-inventory.md`) — revisar com cuidado antes de merge.

## Schema (proposto — revisar antes de gerar migration)

```prisma
enum CashSessionStatus {
  open
  closed
}

/// Épico 20 (PDV + caixa). Uma sessão por LOJA (não por operador — decisão 3
/// do handoff): quem abre, sangra e fecha fica registrado por ação, não a
/// sessão em si. Índice único parcial (WHERE status = 'open') garante só uma
/// sessão aberta por loja ao mesmo tempo — SQL à mão na migration, mesmo
/// padrão do tracking_token de Order.
model CashSession {
  id       String @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId String @map("tenant_id") @db.Uuid
  storeId  String @map("store_id") @db.Uuid

  status CashSessionStatus @default(open)

  openedAt        DateTime @default(now()) @map("opened_at")
  openedByUserId  String   @map("opened_by_user_id") @db.Uuid
  openingAmountCents Int   @map("opening_amount_cents")

  closedAt          DateTime? @map("closed_at")
  closedByUserId    String?   @map("closed_by_user_id") @db.Uuid
  /// Valor contado fisicamente pelo operador no fechamento.
  countedAmountCents Int?     @map("counted_amount_cents")
  /// opening + vendas_dinheiro - sangrias, calculado no fechamento — snapshot,
  /// não recalculado depois (mesmo racional de Order.totalCents).
  expectedAmountCents Int?    @map("expected_amount_cents")

  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  store  Store  @relation(fields: [storeId], references: [id])
  orders Order[]
  withdrawals CashWithdrawal[]

  @@index([tenantId, storeId, status])
  @@map("cash_sessions")
}

/// Sangria. Aprovação de manager obrigatória (decisão 5) — approvedByUserId
/// nunca nulo, mesmo padrão de approval:true da matriz de permissões.
model CashWithdrawal {
  id            String @id @default(dbgenerated("uuidv7()")) @db.Uuid
  tenantId      String @map("tenant_id") @db.Uuid
  cashSessionId String @map("cash_session_id") @db.Uuid

  amountCents     Int    @map("amount_cents")
  reason          String?
  requestedByUserId String @map("requested_by_user_id") @db.Uuid
  approvedByUserId  String @map("approved_by_user_id") @db.Uuid
  createdAt         DateTime @default(now()) @map("created_at")

  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  cashSession CashSession @relation(fields: [cashSessionId], references: [id])

  @@index([tenantId, cashSessionId])
  @@map("cash_withdrawals")
}
```

`Order` ganha `cashSessionId String? @map("cash_session_id") @db.Uuid` — nullable
porque só pedidos de balcão (`cash_at_counter`/`card_at_counter`) vinculam;
pedidos de storefront (PIX/delivery) nunca têm sessão. CHECK na migration:
`cash_session_id IS NOT NULL` apenas quando `payment_method IN
('cash_at_counter','card_at_counter')` — mesmo padrão do CHECK de
`fulfillment_type`/endereço.

RLS: `cash_sessions`/`cash_withdrawals` seguem a policy padrão por
`tenant_id = current_setting('app.tenant_id')::uuid` — copiar o texto exato da
policy de `order_adjustments` na migration mais recente que a criou.

## Contratos (`packages/contracts`)

- `openCashSessionSchema` — `{ openingAmountCents: number }` (inteiro, >= 0).
- `closeCashSessionSchema` — `{ countedAmountCents: number }`.
- `createCashWithdrawalSchema` — `{ amountCents: number, reason?: string,
  approverPin: string }`.

**Decisão fechada (2026-09-14): PIN na hora, não aprovação assíncrona.** Não
existe fluxo de PIN de manager no código hoje — `require-permission.guard.ts:19`
já comenta "fluxo de PIN fica pro Épico do PDV", confirmando que este é o lugar
certo. Nasce neste épico como
`POST /v1/admin/stores/:storeId/staff/verify-pin { pin }`, reutilizável por
qualquer fluxo `approval: true` futuro (desconto manual, cancelamento de pedido
pago). Cada `User` staff precisa de um `pinHash` (novo campo, nunca o PIN em
claro) — checar se já existe algo parecido antes de adicionar coluna.

## Endpoints (`apps/api/src/orders` ou novo módulo `apps/api/src/cash/`)

```
POST   /v1/admin/stores/:storeId/cash-sessions            → abre (cash.open_close)
GET    /v1/admin/stores/:storeId/cash-sessions/current     → estado atual (open|none)
POST   /v1/admin/stores/:storeId/cash-sessions/:id/close   → fecha (cash.open_close, selfOnly)
POST   /v1/admin/stores/:storeId/cash-sessions/:id/withdrawals → sangria (cash.withdraw, approval)
```

Todos com `@RequireModule('cash_register')` + `@RequirePermission(...)` — as
permissões `cash.open_close`/`cash.withdraw` **já existem**
(`packages/contracts/src/permissions.ts:53-54`, matriz completa nas linhas
181-235), só falta o service que as usa.

`CounterOrderController.create` passa a resolver a sessão aberta da loja e
recusar com erro de domínio (`NoOpenCashSessionError`, 409) se não houver.

## Registry (`packages/contracts/src/modules.ts`)

```ts
pdv: { plans: PLANS, default: true },              // era plans: ['premium']
'pdv.mobile': { plans: PLANS, default: false, requires: ['pdv'] },
cash_register: { plans: PLANS, default: true, requires: ['pdv'] }, // era ['premium']
```

`tables`/`kds`/`channel.qrcode_table`/`channel.waiter_app` continuam fora de
escopo deste épico — não mexer.

## Analytics

Extensão do `AnalyticsController` (ou controller novo `cash-analytics`, mesmo
padrão de `CmvController` ao lado de `AnalyticsController`): corte de venda em
dinheiro por sessão fechada — total esperado vs contado (quebra de caixa),
agregado por operador e por período. `@RequireModule('cash_register')`.

## Frontend (`apps/backoffice`)

- Modal bloqueante de abertura de caixa: dispara ao entrar em `/gestor/balcao`
  (ou em qualquer rota do gestor, a decidir) se `GET .../cash-sessions/current`
  voltar `none` — e novamente após um período de inatividade a definir (ex.:
  sessão de front expirada / troca de dia calendário).
- Botão de sangria com prompt de PIN do manager.
- Tela de fechamento com conferência (valor esperado vs contado) antes de
  liberar o próximo turno.

## Fora de escopo deste épico (não implementar agora)

- Múltiplas sessões simultâneas por loja.
- Enforcement automático de bloqueio por inatividade prolongada (só o prompt).
- Painel de super-admin pra feature-flag por tenant (módulo nasce ligado pra
  todos por ora).
