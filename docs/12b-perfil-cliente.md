# Épico 12b — Perfil do cliente (`Minha conta`)

## Status

Fatia core implementada e validada. Cupons e fidelidade continuam pertencendo aos Épicos 15 e 16.

## Decisão de módulo

O registry já possui o módulo core `customers`. O perfil do cliente não cria uma nova chave de módulo: é uma superfície do próprio `customers`, disponível a qualquer tenant. Os módulos `coupons` e `loyalty` só acrescentam benefícios quando estiverem ativos e implementados.

## Escopo desta fatia

- página `/{slug}/minha-conta` no storefront;
- consulta e alteração do nome do cliente;
- telefone e e-mail somente mascarados;
- lista, criação, edição e exclusão lógica de endereços do próprio cliente;
- histórico resumido dos pedidos do próprio cliente;
- acesso somente com a sessão curta obtida pelo OTP do checkout, usando o JWT de customer já existente;
- ausência ou expiração da sessão volta ao cardápio e não dispara OTP em `Minha conta`, preservando a regra de pedir código somente no “Fazer pedido”.

Não entram nesta fatia:

- emissão, resgate ou histórico de cupons;
- saldo ou extrato de fidelidade;
- alteração de telefone/e-mail, pois muda a identidade e exige novo fluxo de verificação;
- reuso automático do endereço salvo pelo checkout;
- exportação e exclusão LGPD, que exigem desenho próprio de retenção e anonimização.

## Rotas

- `GET /v1/store/:slug/me`
- `PATCH /v1/store/:slug/me`
- `GET /v1/store/:slug/me/addresses`
- `POST /v1/store/:slug/me/addresses`
- `PATCH /v1/store/:slug/me/addresses/:addressId`
- `DELETE /v1/store/:slug/me/addresses/:addressId`
- `GET /v1/store/:slug/me/orders`

## Segurança e isolamento

- `CustomerJwtAuthGuard` autentica o cliente.
- O `customerId` vem exclusivamente do JWT, nunca do body ou da URL.
- O slug resolve o tenant e o `TenantContextInterceptor` abre a transação com RLS.
- Toda busca adiciona `customerId` explicitamente, inclusive endereços e pedidos.
- Telefone e e-mail nunca saem em claro; a API retorna apenas versões mascaradas.
- Escritas usam `version` para optimistic locking. Zero linhas alteradas resulta em HTTP 409.
- Pedido guest não cria uma sessão e, portanto, não ganha acesso ao perfil.

## Endereços

O endereço salvo é conveniência para o cliente. Zona, taxa, horário e disponibilidade continuam sendo revalidados no checkout; nenhum valor persistido no perfil vira autoridade de preço. Nesta fatia o CRUD não chama geocoder e mantém `geo` nulo em endereços criados pelo perfil.

O checkout atual cria um novo snapshot/registro de endereço a cada pedido. A API do perfil elimina duplicatas idênticas na leitura e mantém a linha mais recente. Reutilizar a linha salva no checkout é uma evolução separada, pois pertence ao fluxo de pedidos.

## Pedidos

O histórico retorna somente resumo: identificador, data, status, tipo de atendimento, pagamento, total e itens congelados. Não retorna telefone nem snapshot completo de endereço.

## Benefícios futuros

Quando os Épicos 15 e 16 existirem, a página pode incluir seções condicionadas aos módulos `coupons` e `loyalty`. Resgates de cupom devem ser append-only para preservar a história do desconto aplicado; não serão inferidos a partir de pedidos nem simulados no cliente.
