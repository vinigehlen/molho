# Handoff para o Codex — combos, fase 4.2 (e o que já está pronto)

Data: 2026-09-01
Fonte da verdade detalhada: `docs/HANDOFF-claude-code-combos.md` (D1–D7, estado
das fatias, migrations pendentes). Este arquivo só diz **o que falta** e em que
ordem. Divergência → `docs/HANDOFF-claude-code-combos.md` e `CLAUDE.md` vencem.

## Antes de tocar em qualquer arquivo

1. Ler `CLAUDE.md` inteiro — regras não-negociáveis, convenções de schema, a
   seção "EXCEÇÃO decidida em 2026-08-28" (a sequência de combo) e "Complexidade
   deliberada".
2. Ler `docs/HANDOFF-claude-code-combos.md` — decisões D1–D7 já travadas com o
   PM. **Não re-decidir.**
3. Ler `docs/04c-catalogo-multicategoria.md` — a estratégia expand/rollback de
   `Product`/`ProductOffer` continua valendo; nada de contração destrutiva.
4. Gate de toda fatia: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
   verdes — **build completo**, não só typecheck isolado (CLAUDE.md explica).
5. Commits pequenos, imperativo em pt-BR, uma fatia por PR.

## Estado atual (tudo no `main`)

| Fase | Estado | Commit |
| --- | --- | --- |
| 1 — código PDV + pausar grupo + aba Complementos | ✅ | `2ef03c2` |
| 2 — grupos de complemento reutilizáveis (N:N) | ✅ | `23429fb` |
| 3 — `Product.kind` (`prepared`/`industrialized`/`combo`) | ✅ | PR #26 |
| 4.1a — fundação: `ComboItem` + CRUD admin + UI no gestor | ✅ | PR #29 |
| 4.1b — combo no checkout: cascata de disponibilidade + snapshot | ✅ | PR #30 |
| **4.2** — preço "a partir de", personalização, combo aninhado | ⬜ | — |

`main` sincronizada com `origin/main` após o merge do PR #30 (`694c5b7`).

### Cuidados de infra (não redescobrir)

- **TypeScript continua em 5.9 / ESLint 9.** Os PRs #18–#21 do dependabot
  subiram TS→7, ESLint→10, tailwindcss→4, vitest→4 etc. e quebraram o CI
  (`typescript-eslint@8.68` não roda com TS 7, `pnpm/action-setup@v6` falha).
  Revertidos no **PR #28**. Não voltar a bumpar TS pra 7 até o
  `typescript-eslint` suportar (typescript-eslint#10940). Bumps futuros do
  dependabot: aceitar em lotes pequenos e revisáveis, nunca o grupo inteiro.

### Migrations pendentes de aplicação

`20260831120000_product_kind_combo_fase3`,
`20260831130000_combo_items_epico_combos_4a`,
`20260831140000_order_item_components_combo_4b` — **nenhuma aplicada em banco
nenhum** (mesmo débito das fases 1/2: `migrations/` local atrás do banco dev
real). Todas idempotentes e aditivas; aplicar via `db:migrate:deploy` ou no
deploy da API. **Não editar essas migrations** — evolução de schema pede
migration nova.

## O que a 4.1a/4.1b deixou pronto (para a 4.2 construir em cima)

- `Product.kind = 'combo'` + tabela `combo_items(combo_product_id,
  child_product_id, quantity, sort_order)`.
- `ComboItemsController` (`/v1/admin/combo-items`), `@RequireModule('combos')`,
  permissão `catalog.product.update`. Valida: pai é combo, filho existe e não é
  combo, filho ≠ pai, sem duplicata.
- Gestor: `combo` no seletor de tipo + `ComboItemsEditor` (seção "Itens do
  combo" na edição).
- Checkout: revalidação carrega os filhos com disponibilidade resolvida
  (produto **E** oferta principal). Combo com qualquer filho indisponível —
  ou sem filho — volta `available: false` → tela de revisão (regra 14).
  `lockProductsForUpdate`/`lockOffersForUpdate` já cobrem os filhos.
- Snapshot: `order_item_components` gravado em `createOrderItems`.
- Storefront: `storefrontProductSchema.comboItems` (opt-in `catalog=offers`);
  `MoProductSheet` mostra "Vem com".
- `combos: { plans: ['pro','premium'], default: true }` em
  `packages/contracts/src/modules.ts`.

### Ceilings da 4.1 que a 4.2 remove

- preço do combo é **fixo** (o da oferta primária do combo);
- filho não tem modificador próprio no combo;
- **sem combo aninhado** (filho nunca é `kind='combo'` — barrado no service e
  por CHECK implícito da regra de negócio);
- tela de revisão do checkout não detalha *qual* filho faltou (cai na revisão
  genérica de "item indisponível");
- gating do módulo `combos` no **front** não existe — depende do painel de
  módulos (épico 14). A API já barra com `@RequireModule('combos')`.
- Trocar `kind` de um combo que já tem itens deixa `combo_items` órfãos
  (soft-deleted por consequência, não por ação) — tolerável até a 4.2 decidir
  o comportamento.

## Fase 4.2 — escopo (CLAUDE.md: "preço total fixo OU por complemento")

**Confirmar o recorte com o PM antes de codar** (mesmo processo D1–D7): a 4.2
tem três eixos independentes, e cada um pode virar uma fatia própria
(commit + gate + deploy separado, como as fases anteriores).

### Eixo A — preço "a partir de" (`sum_of_items`)

- Hoje o preço do combo é `ProductOffer.priceCents` (fixo). Adicionar um modo
  onde o preço = soma da oferta primária de cada filho × `quantity`.
- Decisão de modelagem em aberto: flag `combo_pricing` (`fixed` | `sum`) em
  `Product` ou em `combo_items`? Interação com `ProductOffer.priceCents` do
  combo (ignora? vira piso?).
- Checkout: no modo `sum`, o preço do combo **depende** do preço dos filhos —
  a revalidação passa a comparar preço de filho, não só disponibilidade
  (regra 14: preço subiu = tela de revisão). O lock dos filhos já existe.
- `order_item_components` provavelmente ganha `unit_price_cents` snapshot por
  filho, e `lineTotalCents` do combo passa a somar os filhos.

### Eixo B — personalização (add/remove item do combo, taxa extra)

- O cliente troca um filho por outro, remove um filho, ou adiciona um extra
  com taxa. Precisa entrar no `cartItemSchema` (aí sim provavelmente sobe
  `CART_SCHEMA_VERSION` — hoje o item de combo no carrinho é só
  `{productId, offerId, quantity}`).
- Interação com os grupos de complemento existentes (`ModifierGroup`) — a
  personalização do combo é um `ModifierGroup` no produto-combo? Ou um
  mecanismo próprio?
- Snapshot: `order_item_components` precisa registrar substituições/remoções.

### Eixo C — combo aninhado

- Hoje barrado (`service.create` rejeita filho `kind='combo'`). Se a 4.2
  liberar, cuidar de: profundidade máxima, ciclo (A contém B contém A),
  explosão do cálculo de preço/disponibilidade, e o snapshot recursivo.
- **Recomendação: manter barrado.** YAGNI até um pedido real do PM.

### Também na 4.2 (dívida da 4.1)

- Tela de revisão do checkout (`apps/storefront`) listar *qual* filho do combo
  ficou indisponível, em vez da mensagem genérica.
- Decidir o comportamento de trocar `kind` de um combo com itens (bloquear?
  avisar? limpar os itens?).

## Comandos seguros para retomar

```bash
git status --short --branch
git pull
pnpm install --frozen-lockfile
pnpm lint && pnpm typecheck && pnpm test && pnpm build
```

`*.e2e.test.ts` fica fora do gate padrão — rodar `pnpm test:e2e` (precisa
Redis/Postgres reais) antes de qualquer merge que mexa no fluxo de checkout.
