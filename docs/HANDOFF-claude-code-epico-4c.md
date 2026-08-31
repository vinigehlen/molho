# Handoff — Épico 4C: produto em múltiplas categorias

Atualizado em: 2026-08-31
Branch: `codex/epico-4c-ofertas-multicategoria`
Base inicial: `main@fa7bf6f`

## Objetivo

Abrir a fundação de `ProductOffer` do 4B para que a mesma identidade de
produto apareça em várias categorias. Cada apresentação controla categoria,
preço, disponibilidade, código PDV e ordem sem duplicar nome, descrição,
fotos ou complementos.

## Decisões travadas

- O 4C continua a estratégia **expand**, sem contração destrutiva.
- `Product` e os triggers bidirecionais permanecem. A oferta
  `is_primary=true` continua sendo a ponte de compatibilidade com importação,
  signup, seed e clientes antigos.
- A API só cria e remove ofertas **secundárias**. A principal nasce e é
  editada pelo fluxo legado de `Product` enquanto durar a expansão.
- Um produto só pode ter uma oferta viva por categoria. A API valida antes e
  o índice parcial do 4B fecha corridas concorrentes.
- `StorefrontProduct.id` continua sendo o ID da identidade; `offerId` identifica
  a apresentação tocada na categoria.
- Carrinhos e requests antigos podem omitir `offerId`; o servidor resolve a
  oferta principal. O storefront novo grava quando a API oferece o catálogo 4C.
- A negociação pública é opt-in: o storefront novo pede
  `GET /v1/store/:slug?catalog=offers`; sem a query, a API nova devolve somente
  as ofertas principais e omite `offerId`, preservando o schema estrito antigo.
- O checkout rejeita uma oferta que não pertença ao `productId` informado e
  trava `products` + `product_offers` antes de revalidar/criar o pedido.
- `order_items` continua guardando snapshots de produto e preço; não foi
  adicionada coluna de oferta porque ela não é necessária para cobrança ou
  histórico no desenho atual.
- A contração das colunas legadas fica para uma migration futura, somente
  depois de importação/signup/seed migrarem e uma janela de release provar
  zero consumidores antigos.

## Implementado nesta branch

### Contratos e API

- `createCatalogProductOfferSchema` e tipos associados.
- `POST /v1/admin/product-offers` cria secundária.
- `PATCH /:id`, `PATCH /:id/availability` editam por optimistic lock.
- `DELETE /:id?version=N` remove somente secundária; remover principal retorna
  erro de domínio em pt-BR.
- Validação de produto/categoria, categoria repetida e movimento da principal
  para uma categoria já ocupada por secundária.
- Testes de contrato, DTO, serviço e extensão do e2e de repositório.

### Storefront, carrinho e checkout

- O repositório público passa a montar cada categoria por `Category.offers`,
  reutilizando a identidade e os complementos de `offer.product`.
- O payload público inclui `offerId` e usa preço/disponibilidade da oferta.
- O carrinho canônico e sua cópia client-side aceitam `offerId` opcional sem
  subir `CART_SCHEMA_VERSION` — compatibilidade com carrinhos já gravados.
- O client do checkout preserva `offerId` da primeira revalidação até a criação.
- A revalidação consulta apresentações explícitas ou a principal como fallback,
  e devolve a oferta efetivamente precificada.
- A criação do pedido trava também as linhas de `product_offers`, fechando a
  corrida de preço/disponibilidade no novo modelo.

### Backoffice

- `catalog-api.ts` ganhou client de listar/criar/editar/pausar/remover ofertas.
- O inspetor do item ganhou a seção **“Disponível em”** na etapa de venda.
- A principal aparece identificada e continua sendo salva com o item.
- Secundárias são criadas, movidas, reprificadas, pausadas e removidas inline,
  com controles de 44px, estados de loading/erro/sucesso e confirmação antes
  da remoção.
- A ordem na categoria é visível e persistida na criação e edição; o resumo da
  principal acompanha categoria, preço e PDV ainda não salvos no rascunho.
- Testes cobrem criação, ordem, pausa e remoção preservando a principal.

### Gate de tooling encontrado durante o 4C

- `packages/db/turbo.json` faz `@molho/db#typecheck` depender do próprio
  `build`, serializando os dois `prisma generate` que antes corriam no mesmo
  diretório em cache miss.
- `mo-card.stories.tsx` ganhou tipo explícito nos dois `args` que já quebravam
  o typecheck de UI.

## Evidência final obtida

- Detector Impeccable nos dois TSX alterados: `[]` (zero achado; não repetido).
- Revisão visual em `.impeccable/review/desktop.png` e `mobile.png`, com cenário
  real do componente e mock só da API. O harness `/visual-test` foi removido.
- Finish reviewer independente: cinco correções pontuadas `10/10`, nenhum risco
  material e `disposition: ship`.
- Documenter Impeccable: nenhuma mudança em `DESIGN.md`; os padrões duráveis já
  estavam documentados e a semântica específica está em `docs/04c-*`.
- Revisão React/Next: efeitos canceláveis, chaves estáveis, estado local restrito
  ao editor, controles rotulados e sem waterfall novo.
- E2E real focado `product-offer.repository.e2e.test.ts`: 6/6, cobrindo RLS,
  FK/triggers, criação/remoção e auditoria.
- Gate final da raiz em 2026-08-31:
  - `pnpm lint`: verde;
  - `pnpm test`: 9/9 tarefas Turbo, incluindo API 588/588 e backoffice 189/189;
  - `pnpm build`: 7/7 tarefas Turbo, incluindo os `next build` completos do
    backoffice e storefront;
  - `pnpm typecheck`: 10/10 verde (rodado também durante a implementação).
- `git diff --check`: verde.

## Estado no momento deste handoff

Implementação e validação local concluídas em dois commits:

- `26c8e8e` — `fix: estabiliza o typecheck do workspace`;
- `4eddaea` — `feat: adiciona ofertas em múltiplas categorias`.

O working tree estava limpo depois dos commits. Push, PR, CI e merge ainda
estavam pendentes enquanto esta revisão do handoff foi escrita.

Pendências, nesta ordem:

1. Fazer push da branch e abrir PR contra `main`.
2. Aguardar CI e mesclar somente se verde.
3. Sincronizar `main` e remover a branch remota/local se aplicável.

Não há migration SQL nova nesta fatia.

## Comandos seguros para retomar

```bash
git status --short --branch
git diff --check
pnpm typecheck
pnpm lint
pnpm test
pnpm build
```

Não editar a migration aplicada `20260829103000_product_offers_expand` e não
remover campos/triggers legados nesta fatia.
