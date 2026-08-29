# Épico 4B — fundação de ofertas do catálogo

## Objetivo e limite

Separar a identidade reutilizável do produto da sua apresentação comercial sem interromper o catálogo existente. `Product` continua guardando nome, descrição e mídia. `ProductOffer` passa a guardar categoria, preço, disponibilidade, código PDV e ordem.

Este passo é somente **expandir**. A API não cria oferta secundária ainda, nenhuma coluna de `products` é removida e storefront/checkout/pedidos continuam lendo o formato legado. A abertura de um mesmo produto em várias categorias pertence ao Épico 4C, quando a UI souber representar esse estado.

## Mapa de dependências

| Superfície | Antes do 4B | Convivência no 4B |
| --- | --- | --- |
| CRUD e importação | `ProductService` escreve `products` | trigger replica na oferta primária |
| Signup | `createMany(products)` direto | trigger cria uma oferta por produto |
| Seed | create/update direto em `products` | trigger cria ou atualiza a oferta primária |
| API antiga durante deploy | conhece só `products` | continua funcional; trigger sincroniza |
| API nova de ofertas | lê/edita `product_offers` | trigger reverso atualiza `products` |
| Storefront, checkout e pedidos | leem `products` | permanecem sem mudança neste passo |

## Estratégia de migração

1. Criar `product_offers` com UUIDv7, `tenant_id`, soft delete, versão, FKs compostas, checks, índices tenant-first e RLS.
2. Fazer backfill de todos os produtos, inclusive soft-deleted, copiando valores e timestamps sem transformação destrutiva.
3. Marcar a linha de compatibilidade como `is_primary=true`.
4. Ativar sincronização bidirecional temporária. Cada lado só escreve quando os campos diferem, evitando recursão e atualizando o lock otimista do outro lado.
5. Implantar a API com leitura e edição de ofertas existentes. Alteração de preço, tanto pela rota antiga quanto pela nova, grava `audit_log` com ator, papel, antes/depois e IP.

Ordem de deploy: **migration primeiro, API depois**. A ordem inversa falha porque o Prisma Client novo consulta `product_offers`.

## Verificação obrigatória

- Contagem: cada produto possui exatamente uma oferta primária correspondente.
- Paridade: categoria, preço, disponibilidade, código PDV, ordem, versão e `deleted_at` coincidem após o backfill.
- Compat antiga → nova: editar `products` altera a oferta e incrementa sua versão.
- Compat nova → antiga: editar a oferta primária altera `products` e incrementa sua versão.
- RLS: tenant A não lista, edita nem vincula categoria/produto do tenant B.
- Auditoria: mudança real de preço gera uma linha; atualização sem mudança de preço não gera.

## Rollback e contração futura

O rollback normal deste passo é reimplantar a API anterior e **manter tabela e triggers**; nenhum consumidor antigo percebe a expansão.

Só é seguro remover a expansão antes de existirem ofertas secundárias. Nesse caso, a ordem é: parar a API nova, conferir paridade, remover primeiro o trigger oferta→produto, depois produto→oferta, remover as funções e por último a tabela. Não executar esse rollback depois do 4C, pois uma oferta secundária não cabe no modelo legado.

A contração definitiva só acontece quando storefront, checkout, pedidos, importação, signup e seed tiverem migrado para ofertas e a telemetria confirmar zero leitura/escrita das colunas antigas por uma janela de release. Nesse momento uma migration separada remove triggers e colunas; nunca nesta expansão.
