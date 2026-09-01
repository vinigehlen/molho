# Handoff para Claude Code — Combos (exceção MVP 2026-08-28)

Atualizado em 2026-09-01.

Sequência aprovada pelo PM (ver CLAUDE.md § "EXCEÇÃO decidida em 2026-08-28"),
em quatro fases, cada uma commit + gate + deploy separado:

1. código PDV + pausar grupo de complemento + aba "Complementos" no gestor
2. grupos de complemento reutilizáveis entre produtos (N:N)
3. `Product.kind` (`prepared` / `industrialized` / `combo`)
4. combo de verdade — item que agrupa outros produtos do catálogo

## Estado atual

| Fase | Estado | Commit / PR | Migration |
| --- | --- | --- | --- |
| 1 | ✅ mesclada | `2ef03c2` | `20260828230000_product_modifier_group_pdv_pause` |
| 2 | ✅ mesclada | `23429fb` | `20260828233000_product_modifier_group_reuse` |
| 3 | ✅ mesclada | PR #26 → `3155f33` | `20260831120000_product_kind_combo_fase3` |
| 4.1a | ✅ mesclada | PR #29 → `a81f822` | `20260831130000_combo_items_epico_combos_4a` |
| 4.1b | ✅ mesclada | PR #30 → `694c5b7` | `20260831140000_order_item_components_combo_4b` |
| handoff 4.2 | ✅ mesclado | PR #31 → `ade4c04` | — |
| correções pré-4.2 (P1.1–P1.3, P2.4–P2.5) | ✅ em `main` | `c50c6c3` | — |
| 4.2A — `combo_pricing_mode` / `sum_of_items` | ✅ em `main` | `9a04b00` | `20260901110000_combo_pricing_product_offer_4_2a` |
| bloqueio de troca de `kind` com filhos vivos | ✅ em `main` | `345a443` | — |
| 4.2B — personalização (add/remove filho, taxa extra) | ⬜ não iniciada | — | pendente de recorte com o PM |
| 4.2C — combo aninhado | ⬜ recomendação: manter bloqueado | — | — |

`main` em `345a443` (`origin/main` sincronizada).

> **Processo:** `c50c6c3`, `9a04b00` e `345a443` foram empurrados direto pra
> `main`, sem PR e sem rodar o CI. Revisão pós-fato (2026-09-01): gates da raiz
> verdes localmente (`pnpm lint` · `typecheck` 10/10 · `test` 9/9 — API 605,
> contratos 331 · `build` 7/7); o desenho do lock (P1.3) e o cálculo
> `sum_of_items` estão corretos. **Falta rodar `pnpm test:e2e`** (precisa
> Redis + Postgres reais) pra confirmar os testes de concorrência de
> `checkout.e2e.test.ts` — não foi possível localmente nesta revisão.

> Nota de infra: entre a fase 3 e a 4.1a, 4 PRs do dependabot (#18–#21)
> quebraram o CI (TS 5.9→7 sem suporte do typescript-eslint, `pnpm/action-setup@v6`
> falho). Revertidos no PR #28. TS 7 só volta quando o typescript-eslint
> suportar (typescript-eslint#10940).

## Fase 3 — o que foi entregue

Discriminador da natureza do produto. Fatia aditiva, zero risco para o
checkout: nenhuma coluna existente muda de tipo/semântica e o default
`prepared` cobre toda linha atual.

- **schema**: `enum ProductKind { prepared industrialized combo }` +
  `Product.kind` com default `prepared`. Migration à mão, idempotente
  (`DO $$ … duplicate_object`, `ADD COLUMN IF NOT EXISTS`), sem reescrever
  linhas.
- **contratos** (`packages/contracts/src/catalog-admin.ts`):
  `productKindSchema` (+ tipo `ProductKind`); `kind` opcional em
  `catalogProductSchema`, `createCatalogProductSchema`,
  `updateCatalogProductSchema`. Três testes de contrato.
- **API**: `CreateProductDto` / `UpdateProductDto` validam `kind` via
  `@IsIn`; `product.repository.ts` inclui `kind` no `SELECT`, grava no
  `create()` e propaga no `update()` (spread genérico).
- **backoffice** (`app/gestor/cardapio/page.tsx`): componente
  `ProductKindPicker` (radiogroup, alvo 44px) na etapa "Conte o básico" do
  cadastro e da edição. Só oferece `prepared` / `industrialized`. Produto
  `combo` já existente aparece rotulado, sem seletor. `ProductDraftReview`
  ganhou a linha "Tipo".

### Fora de escopo da fase 3 (intencional)

- Storefront e checkout **não** leem `kind` — o `select` público é
  explícito, nada vaza. Combo só altera o checkout na fase 4.
- Lista de produtos não ganhou badge de tipo (cosmético).

### Gate final da raiz (fase 3)

`pnpm lint`, `pnpm typecheck` (10/10), `pnpm test` (API 588, backoffice
189, contratos 326) e `pnpm build` (7/7) verdes. `git diff --check` limpo.

### Migrations pendentes de aplicação

`20260831120000_product_kind_combo_fase3` (fase 3),
`20260831130000_combo_items_epico_combos_4a` (4.1a) e
`20260831140000_order_item_components_combo_4b` (4.1b) estavam pendentes em
2026-09-01 no Neon apontado pelo `.env.local` local. Isso não afirma staging
nem produção — conferir cada ambiente separadamente antes de deploy. Todas
idempotentes e aditivas.

## Fase 4 — combo de verdade

Escopo aprovado (CLAUDE.md): item que agrupa outros produtos do catálogo,
preço total fixo **ou** por complemento ("a partir de"), com personalização
opcional. Quebrada em fatias porque toca o caminho de dinheiro do checkout.

### Decisões travadas com o PM

| # | Decisão |
| --- | --- |
| D1 | O combo É um `Product` com `kind = 'combo'`. Nova tabela `combo_items(combo_product_id, child_product_id, quantity, sort_order)`. Sem tabela `combos` separada. |
| D2 | Preço **fixo** na 4.1 (o da oferta primária do combo). "A partir de" fica pra 4.2. |
| D3 | Personalização (add/remove item, taxa extra) adiada pra 4.2. |
| D4 | Snapshot no pedido: 1 `order_item` pro combo + `order_item_components` (tabela nova, na 4.1b). |
| D5 | Cart não muda (`CART_SCHEMA_VERSION` intacto). O item de carrinho do combo é só `{productId, offerId, quantity}`; o servidor expande os filhos na revalidação. |
| D6 | Revalidação (4.1b): `lockProductsForUpdate` passa a travar os filhos; filho indisponível/reprecificado → combo indisponível / tela de revisão. |
| D7 | `combos: { plans: ['pro','premium'], default: true }` — nasce ligado em quem tem direito. Gating do módulo no front fica pro painel de módulos (épico 14). |

### 4.1a — fundação

Aditivo, zero risco pro checkout — combo ainda não é wireado no `/checkout`.

- **schema**: `ComboItem` + migration `20260831130000_combo_items_epico_combos_4a`
  (RLS `tenant_isolation`, FKs compostas `(*, tenant_id) → products`, único
  parcial `(combo_product_id, child_product_id)`, CHECK `quantity > 0` e
  CHECK `combo_product_id <> child_product_id` apenas contra autorreferência
  direta; combo aninhado é validação somente na aplicação em 4.1).
- **contratos**: `combo-admin.ts` (`comboItemSchema` / create / update). +4 testes.
- **API**: `ComboItemsController` em `/v1/admin/combo-items`,
  `@RequireModule('combos')` + `catalog.product.update`. Service valida:
  pai é `kind='combo'`, filho existe e NÃO é combo, filho ≠ pai, sem
  duplicata. +7 testes de serviço.
- **backoffice**: `combo` entra no `ProductKindPicker`; seção "Itens do combo"
  (`ComboItemsEditor`) aparece na edição quando `kind='combo'` — adicionar
  filho (select de produtos não-combo), quantidade inline, remover com
  confirmação, alvos de 44px.

Ceilings da 4.1a (`ponytail:`): sem combo aninhado, sem modificador de filho,
sem preço "a partir de", sem gating de módulo no front. Trocar `kind` de um
combo com itens deixa as linhas vivas em `combo_items`; elas ficam ignoradas
enquanto o pai não é combo e reaparecem se o tipo voltar para `combo`. A 4.2
precisa decidir se isso será bloqueado, confirmado com soft-delete explícito,
ou preservado de propósito.

### 4.1b — checkout

Combo entra no caminho de dinheiro. Preço continua fixo (o da oferta do
combo) — os filhos só decidem disponibilidade e viram snapshot.

- **schema**: `OrderItemComponent` + migration
  `20260831140000_order_item_components_combo_4b` (append-only, RLS, FKs
  compostas). Não entra em `lineTotalCents`.
- **contratos**: `revalidatedItemSchema.comboComponents` (opcional, só em
  combo disponível); `storefrontProductSchema.comboItems` (opcional, opt-in
  `catalog=offers`).
- **revalidação**: `findOffersForItems` carrega `kind` + os filhos com
  disponibilidade resolvida (produto E oferta principal do filho). Combo com
  qualquer filho indisponível — ou sem filho nenhum — volta `available:
  false` → tela de revisão obrigatória (regra 14). Combo disponível carrega
  `comboComponents` no item.
- **lock**: `CheckoutOrderService` trava primeiro os produtos-pai solicitados,
  depois trava as linhas vivas de `combo_items` desses pais e só então amplia
  `lockProductsForUpdate` + `lockOffersForUpdate` pros filhos — a composição,
  quantidade e disponibilidade do filho ficam estáveis pela mesma janela.
- **snapshot**: `createOrderItems` grava `order_item_components` a partir de
  `item.comboComponents`.
- **storefront**: `comboItems` no payload público (só com `catalog=offers` e
  só em `kind='combo'` com filhos); `MoProductSheet` mostra a seção "Vem
  com" (exibição pura, sem seleção).

Ceilings mantidos: preço fixo, sem modificador de filho, sem combo aninhado.
Tela de revisão do checkout (`apps/storefront`) ainda não lista os
componentes explicitamente — o item de combo indisponível já cai na revisão
genérica de "item indisponível"; detalhar "qual filho faltou" fica pra um
ajuste de UI posterior.

### 4.2 — iniciada pela fatia 4.2A

Preço "a partir de" (`ProductOffer.priceCents` vs soma dos filhos),
personalização (add/remove item do combo, taxa extra), combo aninhado.

Decisão de ownership registrada na 4.2A: `combo_pricing_mode` mora em
`ProductOffer`, com valores `fixed | sum_of_items`. Cada apresentação comercial
pode escolher o modo; `ComboItem` só guarda dados por filho (composição,
quantidade, contribuição futura), não uma flag agregada do combo.

Entregue na 4.2A: migration expansiva, contratos/admin API, backoffice mínimo,
storefront com `basePriceCents` consolidado e checkout recalculando
`sum_of_items` com snapshot `order_item_components.unit_price_cents`.

Correção pós-4.2A: trocar `kind` de um combo com filhos vivos fica bloqueado
até o lojista remover a composição. Isso evita esconder `combo_items` vivos por
uma mudança acidental de tipo.

### 4.2B — personalização (não iniciada — precisa recorte do PM)

Escopo bruto (CLAUDE.md): "adicionar/remover item do combo, taxa extra". Antes
de codar, fechar com o PM item a item (mesmo processo D1–D7):

1. **O que o cliente pode fazer?** só remover um filho, ou também trocar por
   outro produto, ou também adicionar um extra pago? (recomendação: remover +
   trocar na 4.2B; adicionar extra numa 4.2B-2)
2. **Mecanismo.** A personalização do combo é um `ModifierGroup` no
   produto-combo (reusa toda a infra de 4.1/4E), ou um mecanismo próprio em
   `combo_items` (ex.: `swappable`, `removable`, `extra_fee_cents` por linha)?
3. **Carrinho.** Hoje o item de combo no carrinho é só
   `{productId, offerId, quantity}`. Personalização quase certamente **sobe
   `CART_SCHEMA_VERSION`** (descarta carrinhos salvos) — confirmar que é
   aceitável.
4. **Preço.** Como a troca/remoção interage com `fixed` vs `sum_of_items`?
   Remover um filho de um combo `fixed` abate quanto? Em `sum_of_items` é a
   diferença das ofertas.
5. **Snapshot.** `order_item_components` precisa registrar substituições e
   remoções (hoje só grava o que veio). Coluna nova (`removed`, `swapped_from`)
   ou linhas com `quantity: 0`?
6. **Revalidação.** A composição personalizada tem que ser revalidada contra o
   `combo_items` fresco (regra 14) — o filho trocado ainda existe? o extra
   ainda está disponível?

### 4.2C — combo aninhado

Hoje barrado só em `ComboItemService.create()` (filho `kind='combo'` é
rejeitado). **Recomendação: manter bloqueado** — YAGNI até pedido explícito do
PM. Se liberar: profundidade máxima, detecção de ciclo, explosão do
cálculo de preço/disponibilidade, snapshot recursivo.

## Comandos seguros para retomar

```bash
git status --short --branch
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Não editar migrations já aplicadas. Não remover campos/triggers legados de
`Product` / `ProductOffer` — a estratégia expand/rollback continua valendo
(`docs/04c-catalogo-multicategoria.md`).
