# Handoff para Claude Code — Combos (exceção MVP 2026-08-28)

Atualizado em 2026-08-31.

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
| 4 | ⬜ não iniciada | — | — |

`main` sincronizada com `origin/main` após o merge da fase 3.

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

### Migration da fase 3 — pendência

`20260831120000_product_kind_combo_fase3` **ainda não foi aplicada em
nenhum banco** — segue o padrão das fases 1/2 (o `migrations/` local está
atrás do banco dev real; aplicar via `db:migrate:deploy` ou no deploy da
API). É idempotente e aditiva.

## Fase 4 — combo de verdade (não iniciada)

Escopo aprovado (CLAUDE.md): item que agrupa outros produtos do catálogo,
preço total fixo **ou** por complemento ("a partir de"), com personalização
opcional (adicionar/remover item do combo, taxa extra).

**A fase mais arriscada das quatro.** O snapshot de `order_items` depende
hoje de `ModifierGroup` / `Modifier`; combo introduz um segundo eixo de
composição. Nada aqui deve ser codado antes de fechar as decisões de
arquitetura item a item com o PM.

Pontos abertos conhecidos:

- modelagem de `combo_items(combo_product_id, child_product_id, qty)` — a
  fundação de dados citada em `docs/01-plano-produto.md` §
  `combos(id, tenant_id, name, price)` / `combo_items` precisa ser
  reconciliada com o modelo atual `Product` + `ProductOffer`;
- como o preço "a partir de" interage com `ProductOffer.priceCents`;
- snapshot no pedido: colunas novas em `order_items` ou tabela filha;
- personalização do combo × grupos de complemento existentes;
- storefront: card de combo, seleção de itens, revalidação no checkout
  (regra 14 do CLAUDE.md — divergência de preço exige consentimento).

## Comandos seguros para retomar

```bash
git status --short --branch
pnpm typecheck && pnpm lint && pnpm test && pnpm build
```

Não editar migrations já aplicadas. Não remover campos/triggers legados de
`Product` / `ProductOffer` — a estratégia expand/rollback continua valendo
(`docs/04c-catalogo-multicategoria.md`).
