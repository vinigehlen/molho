# Épico 4C — produto em múltiplas categorias

## Objetivo e limite

Abrir a fundação de `ProductOffer` do 4B para que uma única identidade de
produto apareça em várias categorias. Nome, descrição, fotos e complementos
continuam em `Product`; categoria, preço, disponibilidade, código PDV e ordem
pertencem a cada oferta.

Esta fatia continua a estratégia **expand**. Não remove colunas de `products`,
triggers ou a oferta principal. Importação, signup, seed e instâncias antigas
continuam escrevendo `Product`; o trigger do 4B mantém a oferta principal em
paridade.

## Contrato funcional

- Uma oferta viva por `(tenant, product, category)`; o índice parcial do 4B
  fecha corridas e a API traduz conflito para erro de domínio em pt-BR.
- A oferta principal não pode ser removida pela API de ofertas. Ela continua
  sendo criada, movida e excluída pelo fluxo legado do produto.
- Criar uma secundária registra `catalog.offer_create` no `audit_log`; mudar
  preço registra `catalog.offer_price_update`.
- O storefront usa `Product.id` como identidade e `offerId` como apresentação.
- Carrinhos e requests antigos podem omitir `offerId`; o checkout resolve a
  oferta principal. Um `offerId` explícito só vale quando pertence ao
  `productId` informado.
- A criação do pedido trava as linhas de `products` e `product_offers` antes
  da revalidação. `order_items` mantém snapshots de nome e preço, sem nova
  coluna de procedência nesta expansão.

## Compatibilidade de deploy

O schema público é estrito. Adicionar `offerId` incondicionalmente quebraria
o storefront antigo, enquanto exigir o campo quebraria o storefront novo
contra uma API antiga. O 4C usa negociação por URL:

- sem query: `GET /v1/store/:slug` devolve somente ofertas principais e omite
  `offerId`, exatamente como o contrato anterior;
- com `?catalog=offers`: a API nova devolve todas as apresentações com
  `offerId`;
- o storefront novo pede `?catalog=offers`, mas aceita `offerId` ausente. Uma
  API antiga ignora a query e o cliente degrada para o cardápio principal;
- a query compõe a chave do CDN, portanto respostas legada e 4C não dividem
  cache.

| Combinação | Resultado |
| --- | --- |
| storefront antigo + API antiga | cardápio principal legado |
| storefront novo + API antiga | query ignorada, cardápio principal e checkout por fallback |
| storefront antigo + API nova | resposta legada sem campos extras |
| storefront novo + API nova | múltiplas categorias e oferta explícita |

A API deve ser publicada antes do backoffice apenas para que os novos botões
de criar/remover já funcionem ao aparecerem. Inverter essa ordem não quebra o
cardápio nem pedidos existentes; somente a nova mutação fica indisponível até
o deploy da API.

## Verificação obrigatória

- contrato público aceita payload legado sem `offerId` e payload 4C com ele;
- o mesmo `Product.id` pode aparecer em duas categorias com `offerId` e preço
  diferentes;
- checkout precifica a secundária, rejeita associação produto/oferta inválida
  e mantém fallback para carrinho legado;
- RLS impede listar, criar ou atualizar oferta de outro tenant;
- criação secundária não altera as colunas legadas da oferta principal;
- criação e mudança de preço deixam auditoria com ator e tenant corretos.

## Rollback

Rollback seguro não apaga dados: retirar `?catalog=offers` do storefront faz a
API nova voltar ao modo legado; esconder a seção “Disponível em” interrompe
novas mutações; a API e a tabela podem permanecer. Ofertas secundárias já
criadas ficam preservadas e invisíveis aos clientes antigos.

Não remover a tabela, os triggers ou as secundárias num rollback de aplicação.
A contração definitiva exige migrar importação/signup/seed, observar uma janela
sem consumidores legados e executar uma migration separada.
