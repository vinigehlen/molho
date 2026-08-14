# PROPOSTA — contrato de mutação de pedido do Balcão

Este documento é insumo para revisão. Ele não é contrato final, não muda schema, não
cria endpoint e não autoriza implementação fora de `docs/`. O Claude Code deve
transformar a decisão aprovada no arquivo final e, só depois, nas camadas donas de
schema/API/UI.

## Leituras respeitadas

- `packages/db/prisma/schema.prisma`
  - `Order.customerId` é `NOT NULL`.
  - `Order.totalCents`, `subtotalCents` e `OrderItem.lineTotalCents` são snapshots
    congelados na criação.
  - `OrderItem` e `OrderItemModifier` são append-only: não têm `version`, não têm
    `deletedAt` e não são editados depois de criados.
  - `Order.fulfillmentType` é `delivery | pickup`, com CHECK em migration para
    manter endereço obrigatório só no delivery.
  - `OrderStatusHistory` é a linha do tempo indexada por pedido, com
    `idempotencyKey` para replays da fila offline.
- `docs/02-definicoes-v1.md` §5.2
  - Cancelamento antes do aceite é livre para cliente.
  - Após aceite, cancelamento passa por política da loja.
  - Item indisponível após pagamento hoje é operacional: a loja liga para o cliente
    e combina substituir, remover item ou cancelar.
  - No MVP, PIX estático e estornos são manuais.
- `docs/07-aprendizados.md`
  - Evitar redesenhar fluxo que já tem armadilha documentada.
  - Reusar idempotência da fila offline onde fizer sentido.
  - Não mascarar mudança de comportamento com teste parcial.

## Objetivo da proposta

Permitir que o Balcão altere um pedido já criado sem violar as invariantes atuais:

- itens de pedido continuam append-only;
- valores históricos continuam congelados;
- `customerId` continua obrigatório;
- a máquina de estados continua sendo a única porta para transição de status;
- a mutação é auditável e idempotente;
- delivery existente não muda por acidente.

## Não objetivos

- Não definir schema Prisma final.
- Não criar tabela, migration, RLS ou contrato compartilhado.
- Não definir UI.
- Não mexer em impressão, checkout, pagamentos, contratos ou banco nesta proposta.
- Não resolver PLU→produto nem pricing do item pesado; isso é camada de catálogo/pedido.

## Decisão 1 — editar pedido append-only

### Proposta

Representar cada alteração como uma nova revisão lógica do pedido, mas sem editar nem
apagar `OrderItem` existente.

Modelo conceitual:

- `Order` continua sendo o agregado canônico do pedido atual.
- Cada comando de mutação cria um registro append-only de revisão/mutação com:
  - `orderId`, `tenantId`;
  - `revisionNumber` incremental por pedido;
  - `idempotencyKey`;
  - ator (`actorId`/papel) ou origem sistema, nunca cliente/staff misturado;
  - motivo obrigatório quando a alteração remove item ou reduz valor;
  - snapshot do subtotal/total antes e depois;
  - lista de operações aplicadas.
- Adição de item cria novas linhas em `OrderItem` e `OrderItemModifier`.
- Remoção ou redução de item não edita a linha original; cria uma linha de ajuste
  negativa ou uma linha de revisão que referencia a linha original removida/reduzida.
- A projeção atual do pedido é derivada de:
  - itens originais;
  - ajustes append-only;
  - última revisão aceita.

Se o schema final quiser simplificar, o mínimo aceitável é uma tabela append-only de
`order_mutations` com payload JSON de operações e totais antes/depois, desde que exista
uma projeção inequívoca e testável do pedido atual.

### Alternativas descartadas

1. Atualizar `OrderItem.quantity` ou `lineTotalCents` no lugar.
   - Descartada porque quebra o contrato explícito do schema: `OrderItem` é
     append-only e representa o que nasceu na criação.
   - Também destrói a auditoria operacional: a cozinha/caixa perde o que foi pedido
     originalmente.

2. Soft delete em `OrderItem`.
   - Descartada porque o modelo não tem `deletedAt` de propósito.
   - Adicionar soft delete mudaria a semântica de item de pedido e contaminaria
     queries existentes com filtro novo.

3. Criar um novo `Order` para cada edição.
   - Descartada porque espalha uma única venda em vários pedidos, complica pagamento,
     impressão, histórico e acompanhamento.
   - Também duplica `customerId`, status e dados de entrega/retirada sem necessidade.

### Porquê

Append-only mantém rastreabilidade e casa com o que já existe. O pedido pode ser
mutável como agregado de negócio sem tornar mutáveis as linhas históricas de item.

## Decisão 2 — totais congelados versus total atual

### Proposta

Não reinterpretar `Order.totalCents`, `subtotalCents` e `OrderItem.lineTotalCents`
como valores recalculáveis retroativamente.

Há duas opções aceitáveis para o contrato final:

1. Manter os campos atuais como snapshot original e criar campos/projeção de total
   atual na revisão.
2. Atualizar `Order.subtotalCents`/`totalCents` para refletir o estado atual, desde que
   cada revisão grave `beforeSubtotalCents`, `afterSubtotalCents`, `beforeTotalCents`
   e `afterTotalCents`.

Minha proposta é a opção 2 para operação do Balcão, porque o gestor, impressão,
pagamento e fechamento normalmente precisam enxergar o total atual no próprio pedido.
O congelamento histórico fica preservado nas revisões append-only.

Regra: nenhuma revisão recalcula linhas antigas. Ela soma:

- linhas originais;
- novas linhas positivas;
- ajustes/remissões append-only;
- taxa de entrega congelada ou ajustada explicitamente por uma operação própria.

### Alternativas descartadas

1. Nunca atualizar `Order.totalCents` e exigir que todo consumidor some revisões.
   - Descartada por risco operacional: cada tela/relatório/impressão teria que
     lembrar de aplicar a projeção certa.
   - A chance de divergência entre consumidores é alta.

2. Recalcular tudo a partir do catálogo atual.
   - Descartada porque preço de produto/modificador pode mudar depois da criação.
   - Viola o princípio de snapshot do checkout.

3. Guardar só delta financeiro sem snapshot antes/depois.
   - Descartada porque auditoria fica pobre e disputas viram arqueologia de eventos.

### Porquê

O valor exibido e cobrado precisa ser operacionalmente simples, mas a história não pode
ser apagada. Total atual no `Order` + revisão append-only com antes/depois dá os dois.

## Decisão 3 — status em que mutação é permitida

### Proposta

Permitir mutação de itens apenas enquanto o pedido ainda está em operação:

- permitido: `received`, `preparing`, `ready`;
- permitido com regra especial para `pickup`: `received`, `preparing`, `ready`;
- bloqueado: `pending_payment`, `in_transit`, `completed`, `expired`,
  `auto_canceled`, `canceled`, `delivery_failed`.

Para `delivery`, bloquear mutação depois de `in_transit`, porque o pedido já saiu da
loja. Para `pickup`, `ready` continua permitido porque o cliente ainda pode pedir
ajuste no balcão antes de retirar; depois de `completed`, bloqueia.

Se uma alteração tornar o pedido inviável, o fluxo correto é cancelamento pela máquina
de estados, não mutação direta para estado terminal.

### Alternativas descartadas

1. Permitir mutação em qualquer status.
   - Descartada porque `completed`/terminais são histórico fechado.
   - Em `in_transit`, delivery já saiu fisicamente da loja.

2. Permitir só em `received`.
   - Descartada porque o caso real de balcão/cozinha acontece também em preparo:
     item acabou, cliente trocou acompanhamento, operador corrigiu quantidade.

3. Criar novos status de “em edição”.
   - Descartada por complexidade prematura. A revisão pode usar optimistic lock e
     idempotência sem expandir a máquina de estados.

### Porquê

Evita reabrir pedido terminal e preserva a semântica operacional da máquina atual.

## Decisão 4 — cliente obrigatório no balcão

### Proposta

Não tornar `Order.customerId` opcional.

Para pedido de balcão sem identificação real do consumidor, a camada dona de pedido deve
usar um cliente técnico por tenant/loja, por exemplo “Cliente balcão”, com telefone
cifrado/sentinel definido pelo contrato final. Esse cliente técnico precisa ser
distinguível como identidade operacional, não como cliente verificado.

Regras propostas:

- `customerVerified` deve ser `false` para cliente técnico de balcão.
- O cliente técnico não deve ser usado para marketing, histórico pessoal, WhatsApp ou
  vínculo de fidelidade.
- Se o cliente real se identificar depois, isso deve ser uma mutação própria de vínculo
  de cliente, não edição silenciosa da linha original sem auditoria.

### Alternativas descartadas

1. Tornar `Order.customerId` nullable.
   - Descartada porque mexe numa invariante central do schema e em muitos consumidores.

2. Reusar um customer real aleatório ou do último pedido.
   - Descartada por LGPD, auditoria e risco óbvio de atribuição errada.

3. Criar identidade de staff como customer.
   - Descartada porque staff e customer são semânticas separadas no projeto.

### Porquê

Preserva a constraint atual e evita que pedido de balcão force coleta de PII só para
satisfazer FK.

## Decisão 5 — idempotência e concorrência

### Proposta

Toda mutação de pedido deve exigir `Idempotency-Key` e `expectedOrderVersion`.

Aplicação:

- `UPDATE orders ... WHERE id = ? AND tenant_id = ? AND version = ?`.
- Se afetar 0 linhas: conflito; o cliente refaz leitura e reaplica intenção se ainda
  fizer sentido.
- A revisão append-only grava a mesma `idempotencyKey`.
- Retry com a mesma chave e mesmo payload devolve o resultado já aplicado.
- Mesma chave com payload diferente retorna conflito de idempotência.

### Alternativas descartadas

1. Sem idempotência.
   - Descartada por fila offline do gestor e por rede instável no balcão.

2. Só optimistic lock, sem chave idempotente.
   - Descartada porque retry após resposta perdida vira 409 falso.

3. Só chave idempotente, sem version.
   - Descartada porque duas alterações legítimas em paralelo poderiam ser aplicadas
     em ordem inesperada sem o operador perceber.

### Porquê

Essa combinação já conversa com o padrão de fila offline do Épico 9 e torna replays
seguros sem aceitar corrida silenciosa.

## Decisão 6 — pagamento, estorno e redução de total

### Proposta

Mutação que aumenta total:

- se pagamento ainda não foi confirmado, apenas atualiza total atual;
- se pagamento já foi confirmado, cria pendência operacional de cobrança adicional,
  mas não confirma automaticamente nenhum pagamento.

Mutação que reduz total:

- registra diferença como estorno devido/manual no MVP, alinhado ao PIX estático;
- não tenta orquestrar PSP;
- exige motivo.

Cancelamento integral continua sendo transição de status, não mutação de item.

### Alternativas descartadas

1. Alterar `paymentStatus` automaticamente.
   - Descartada porque `paymentStatus` só tem `aguardando_confirmacao` e `confirmado`;
     ele não expressa parcial/adicional.

2. Criar estorno automático agora.
   - Descartada porque docs/02 define PIX estático e estorno manual no MVP.

3. Proibir qualquer alteração financeira após pagamento.
   - Descartada porque docs/02 já prevê item indisponível após pagamento com
     substituir/remover/cancelar.

### Porquê

O contrato acompanha a operação real sem fingir integração financeira que ainda não
existe.

## Decisão 7 — delivery versus pickup

### Proposta

Mutação de itens deve funcionar igual para `delivery` e `pickup`, mas não pode mudar
`fulfillmentType` nesta fatia.

Regras:

- `delivery` mantém snapshot de endereço do cliente e taxa de entrega conforme pedido.
- `pickup` mantém campos de entrega nulos conforme CHECK.
- Trocar delivery↔pickup é uma mutação diferente, com impacto em taxa, endereço,
  comunicação e possivelmente pagamento; fica fora desta proposta.

### Alternativas descartadas

1. Permitir trocar `fulfillmentType` junto com item.
   - Descartada porque mistura duas ideias e aumenta risco de quebrar delivery
     existente.

2. Implementar regras só para pickup.
   - Descartada porque o agregado `Order` é o mesmo; a mutação de item precisa ser
     consistente nos dois caminhos.

### Porquê

Mantém o escopo estreito e protege o caminho de delivery existente.

## Decisão 8 — contrato de operações

### Proposta

O comando de mutação deve aceitar uma lista explícita de operações, não um “pedido
inteiro editado” vindo do cliente.

Operações propostas:

- `add_item`
  - produto, quantidade, modificadores, observações;
  - servidor revalida preço e disponibilidade no momento da mutação;
  - cria novas linhas append-only.
- `remove_item`
  - referência à linha original ou à linha adicionada em revisão;
  - quantidade a remover;
  - motivo obrigatório.
- `change_quantity`
  - modelada como delta append-only, não update in-place;
  - aumento equivale a nova linha positiva;
  - redução equivale a ajuste/removal parcial com motivo.
- `update_notes`
  - se aprovada, deve ser append-only como nova nota de preparo vinculada ao item;
  - não edita `OrderItem.notes` original.

### Alternativas descartadas

1. Receber o pedido inteiro reescrito.
   - Descartada porque apaga intenção: não dá para saber se item sumiu por remoção,
     erro de cliente, tela desatualizada ou bug.

2. Permitir patch arbitrário de campos.
   - Descartada porque abre superfície para alterar total, status, endereço e
     pagamento fora das regras.

### Porquê

Operações explícitas são mais fáceis de auditar, testar e reconciliar com impressão e
fila offline.

## Decisão 9 — impressão e reimpressão

### Proposta

Mutação de pedido não chama impressão diretamente.

Ela deve emitir apenas um evento/domínio ou registro que a camada dona da impressão
consuma depois, se o Épico 10 assim decidir. O contrato de mutação deve carregar dados
suficientes para a impressão montar uma “alteração de comanda” sem ler histórico
ambíguo:

- número do pedido;
- revisão;
- operações aplicadas;
- itens/quantidades/modificadores;
- motivo quando houver remoção/redução.

### Alternativas descartadas

1. Gerar bytes ESC/POS dentro do Balcão.
   - Descartada porque impressão é território do Épico 10.

2. Fazer a mutação depender de impressão bem-sucedida.
   - Descartada porque falha de impressora não pode impedir correção operacional do
     pedido; impressão tem fila/retry própria.

### Porquê

Mantém a fronteira entre pedido e impressão, e evita acoplamento entre dois épicos.

## Decisão 10 — auditoria e histórico

### Proposta

Toda mutação deve gravar auditoria de domínio própria e, quando alterar status,
usar exclusivamente a função de transição de status já existente.

`OrderStatusHistory` não deve ser usado para representar “removeu batata” ou “mudou
quantidade”; ele é linha do tempo de status. A mutação de item precisa de histórico
próprio ou audit log com entidade pesquisável.

### Alternativas descartadas

1. Enfiar mutação de item em `OrderStatusHistory.reason`.
   - Descartada porque mistura status com conteúdo do pedido.

2. Só escrever `audit_log` genérico.
   - Descartada se não houver índice por entidade; reconstruir pedido editado via JSON
     genérico é frágil.

### Porquê

Status e conteúdo são eixos diferentes. Misturar os dois hoje economiza tabela, mas
cobra caro em suporte e relatório.

## Pontos abertos para o contrato final

1. Nome e forma exata da entidade append-only:
   - `order_revisions`;
   - `order_mutations`;
   - `order_item_adjustments`;
   - combinação entre revisão e ajustes.
2. Se `Order.totalCents` deve virar total atual ou permanecer snapshot original com uma
   projeção separada. Esta proposta recomenda total atual no `Order` e histórico nas
   revisões.
3. Como representar cliente técnico de balcão sem contaminar marketing/WhatsApp.
4. Se alteração de observação deve ser permitida depois de `preparing`.
5. Como sinalizar cobrança adicional/estorno manual sem ampliar `paymentStatus`.
6. Se `ready` em delivery deve aceitar alteração ou exigir voltar operacionalmente para
   `preparing` antes de editar. Esta proposta permite `ready`, mas bloqueia
   `in_transit`.

## Checklist de aceite da proposta final

- Não edita `OrderItem`/`OrderItemModifier` existentes.
- Não torna `Order.customerId` nullable.
- Não recalcula preço a partir do catálogo atual para linhas históricas.
- Não muda `fulfillmentType` dentro da mutação de item.
- Não toca impressão diretamente.
- Usa `Idempotency-Key` e `Order.version`.
- Registra antes/depois de totais.
- Mantém delivery existente com mesmo comportamento quando não há mutação.
- Bloqueia pedido terminal.
- Testa concorrência, replay idempotente e redução/aumento de quantidade.
