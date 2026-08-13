# 10 — Impressao de comandas

Desenho aprovado para a fila duravel de impressao do pedido.

## Estado atual

Implementado ate aqui:

- migration `print_jobs` + RLS em `packages/db` no commit `be2caae`;
- documentacao inicial da fila no commit `1d48e79`;
- modulo de API em `apps/api/src/printing/` no commit `7b30581`;
- cobertura e2e de concorrencia/RLS no commit `1e0c0e3`;
- botao de segunda via no gestor enfileirando job duravel;
- consumidor navegador no gestor para provar `claim -> window.print() ->
  printed/failed`.

O modulo de API ja consome a tabela duravel, monta a comanda como snapshot,
enfileira automaticamente a primeira via ao criar pedido quando o modulo
`printing.escpos` esta ativo, e permite segunda via por rota manual.

Ainda falta para o epico ficar utilizavel na loja:

- agente local ESC/POS para impressao silenciosa/fisica sem dialogo do
  navegador;
- configuracao/wizard de impressora ESC/POS, que fica no proximo bloco do Epico
  10 e nao muda a tabela.

## Escopo

O MVP precisa imprimir comanda de cozinha/balcao/caixa quando um pedido novo
chega, e permitir segunda via a qualquer momento por acao manual do operador.

Este epico nao implementa ESC/POS/tipagem de impressora no browser. A tabela
`print_jobs` guarda uma comanda ja renderizada em texto (`ticket_text`) e o
agente/consumidor local reivindica os jobs da fila.

O gestor tem um consumidor navegador temporario para fechar o circuito da fila
duravel no piloto: ele reivindica jobs e abre `window.print()` com a
`ticket_text`. Isso ainda nao e impressao silenciosa; se o operador cancelar o
dialogo, o browser nao entrega confirmacao confiavel. A confirmacao real por
dispositivo fica para o agente ESC/POS.

## Divisao de responsabilidade

- `packages/db`: dono do schema, migration `print_jobs` e RLS.
- `apps/api/src/printing/`: dono das rotas, montagem da comanda, claim, lease e
  conclusao idempotente.
- `apps/api/src/orders/checkout.controller.ts`: unico toque fora do modulo de
  impressao, para enfileirar a primeira via depois que o pedido e criado.
- DTOs ficam internos ao modulo de API. Nao ha contrato compartilhado em
  `packages/contracts` neste desenho.

Se a implementacao provar necessidade real de contrato compartilhado, parar
antes de tocar fora do modulo e reabrir a decisao.

## Tabela consumida

`print_jobs` nasce no `packages/db` com:

- RLS com `FORCE ROW LEVEL SECURITY`;
- `tenant_id`;
- `order_id`;
- `idempotency_key`;
- `status`: `queued`, `printing`, `printed`, `failed`;
- `ticket_text`;
- `width`;
- `cut`;
- `attempts`;
- `lease_until`;
- `leased_by`;
- `last_error`;
- `version`;
- timestamps e soft delete;
- FK composta `(order_id, tenant_id)` para impedir job de um tenant apontar
  para pedido de outro tenant;
- indice FIFO parcial para pendentes.

## Concorrencia

As duas travas coexistem e fecham corridas diferentes.

### Claim

O claim usa `SELECT ... FOR UPDATE SKIP LOCKED` dentro de transacao com contexto
de tenant/RLS ativo.

Elegiveis:

- `status = 'queued'`;
- ou `status = 'printing' AND lease_until < now()`, para re-lease de job
  abandonado.

Ordenacao:

- FIFO por `created_at ASC`.

Depois de selecionar a linha, o modulo atualiza o job para:

- `status = 'printing'`;
- `leased_by = workerId`;
- `lease_until = now() + lease`;
- `attempts = attempts + 1`;
- `version = version + 1`;
- `updated_at = now()`.

`SKIP LOCKED` decide qual worker pega o job naquele instante.

### Conclusao

Conclusao (`printing -> printed` ou `printing -> failed`) usa optimistic lock:

```sql
UPDATE print_jobs
SET status = $next_status,
    version = version + 1,
    updated_at = now()
WHERE id = $id
  AND version = $expected_version
  AND status = 'printing'
  AND leased_by = $worker_id
  AND deleted_at IS NULL;
```

Para `printed`, tambem seta `printed_at = now()` e limpa `lease_until` /
`leased_by`.

Para `failed`, grava `last_error` e limpa `lease_until` / `leased_by`.

`0` linhas afetadas significa concorrencia perdida: o lease expirou e outro
worker re-claimou, o job mudou de estado, ou a versao ficou stale. O modulo deve
tratar como conflito benigno para o worker, nunca como sucesso cego.

## Idempotencia

Idempotencia fica em `tenant_id + idempotency_key`.

Reenviar a mesma chave reaproveita o job existente. Enviar chave nova cria nova
via para o mesmo pedido.

Chaves sugeridas:

- via automatica inicial: `order:{orderId}:kitchen:v1`;
- segunda via manual: chave nova por clique, gerada pelo cliente/agente.

## Impressao automatica e segunda via

Pedido novo deve enfileirar automaticamente uma comanda para
cozinha/balcao/caixa quando a loja tiver impressao ativa.

No codigo atual, isso acontece no checkout: depois que `createOrder()` cria o
pedido com sucesso, o controller chama a fila de impressao inicial. A chave
idempotente da via automatica e:

```text
order:{orderId}:kitchen:v1
```

Com o modulo `printing.escpos` desligado, o checkout nao cria job de impressao.

Segunda via e sempre manual: o operador clica em "Imprimir", a API cria outro
`print_job` para o mesmo pedido com outra `idempotency_key`, e o agente imprime.

No gestor atual, o botao vive no `OrderCard` em
`apps/backoffice/app/gestor/page.tsx`. Ele chama
`queueKitchenTicketCopy()` em `apps/backoffice/lib/printing-api.ts`, que por sua
vez chama:

```text
POST /v1/admin/printing/orders/:orderId/jobs
```

Cada clique gera uma chave nova no formato:

```text
manual:{orderId}:{randomUUID}
```

Reimprimir nao consome estado:

- nao altera status do pedido;
- nao confirma pagamento;
- nao avanca fluxo operacional;
- nao invalida a primeira via.

Observacao de implementacao: para auto-imprimir pedido novo, o codigo precisa
tocar minimamente o fluxo de criacao de pedido em `apps/api/src/orders/`, alem
do modulo `apps/api/src/printing/`. Esse toque deve ser pequeno e explicito:
apos criar o pedido, enfileirar a via inicial de impressao. Se esse ponto fugir
do escopo aprovado, parar e revalidar antes de codar.

## Comanda

A comanda e snapshot no momento de criacao do `print_job`. Ela nao recalcula o
pedido depois.

Conteudo permitido:

- numero/identificador curto do pedido;
- hora do pedido;
- tipo: entrega ou retirada;
- nome do cliente;
- itens;
- quantidades;
- modificadores;
- observacoes dos itens/pedido, se existirem.

Conteudo proibido:

- preco;
- total;
- telefone;
- endereco;
- qualquer PII alem do nome do cliente.

Formato base:

```text
PEDIDO #AB12
13/08/2026 19:42
ENTREGA
Cliente: Maria

2x X-Burger
  + Bacon
  + Cheddar
  Obs: sem cebola

1x Batata media

Obs: caprichar no guardanapo
```

Para retirada, a linha de tipo vira `RETIRADA`. A comanda nao imprime endereco
da loja nem endereco do cliente.

## Rotas previstas

Todas as rotas ficam sob `v1/admin/printing`, com JWT de staff, `X-Tenant-Id`,
RLS via `TenantContextInterceptor`, `@RequireModule('printing.escpos')` e
permissao de leitura de pedido.

```text
POST /v1/admin/printing/orders/:orderId/jobs
```

Cria ou reaproveita um job de impressao para o pedido.

```text
POST /v1/admin/printing/jobs/claim
```

Worker/agente reivindica o proximo job elegivel.

```text
POST /v1/admin/printing/jobs/:id/printed
```

Worker marca job como impresso, com optimistic lock.

```text
POST /v1/admin/printing/jobs/:id/failed
```

Worker marca falha de impressao, com optimistic lock e `last_error`.

## Arquivos implementados

Modulo de impressao:

- `apps/api/src/printing/printing.module.ts`;
- `apps/api/src/printing/printing.controller.ts`;
- `apps/api/src/printing/printing.service.ts`;
- `apps/api/src/printing/print-job.repository.ts`;
- `apps/api/src/printing/print-ticket.ts`;
- `apps/api/src/printing/printing.tokens.ts`;
- `apps/api/src/printing/dto/claim-print-job.dto.ts`;
- `apps/api/src/printing/dto/create-print-job.dto.ts`;
- `apps/api/src/printing/dto/finish-print-job.dto.ts`;
- `apps/api/src/printing/print-ticket.test.ts`;
- `apps/api/src/printing/printing.service.test.ts`;
- `apps/api/src/printing/printing.e2e.test.ts`.

Integracao minima com pedidos:

- `apps/api/src/orders/orders.module.ts`;
- `apps/api/src/orders/checkout.controller.ts`.

Gestor:

- `apps/backoffice/app/gestor/page.tsx`;
- `apps/backoffice/app/gestor/print-job-consumer.tsx`;
- `apps/backoffice/lib/printing-api.ts`;
- `apps/backoffice/lib/printing-api.test.ts`.

## RLS e worker

Como `print_jobs` usa `FORCE ROW LEVEL SECURITY`, qualquer claim precisa de GUC
de tenant setado. O desenho aprovado e tenant-scoped: o agente opera dentro de
um tenant autenticado, nao como varredura global de todos os tenants.

Isso mantem a regra hard do repo: request path usa `RequestContextService`, e o
banco continua sendo a ultima linha de isolamento.

## Testes minimos

- montagem da comanda sem preco, telefone ou endereco;
- comanda funciona para pedido guest e verificado;
- comanda diferencia entrega e retirada;
- criacao idempotente reaproveita job com a mesma chave;
- segunda via com chave nova cria novo job;
- claim FIFO usa `FOR UPDATE SKIP LOCKED`;
- claim faz re-lease de `printing` expirado;
- conclusao exige `id`, `version`, `status = 'printing'` e `leased_by`;
- worker stale recebe conflito quando a versao ou lease nao batem;
- RLS impede acesso cross-tenant.

Cobertura atual:

- unitarios de montagem da comanda;
- unitarios de idempotencia, claim e conclusao;
- e2e real contra Postgres/Neon para idempotencia, `FOR UPDATE SKIP LOCKED`,
  re-lease expirado, optimistic lock stale e isolamento cross-tenant por RLS.

Comandos usados no fechamento:

```bash
cd apps/api && pnpm exec dotenv -e ../../.env.local -- vitest run src/printing/printing.e2e.test.ts --no-file-parallelism
pnpm lint
pnpm test
pnpm build
```

Resultado registrado: e2e isolado de impressao com 6 testes passando; suite
unitaria padrao passando; build completo passando.

## Proximo bloco

O proximo passo do Epico 10 deve ser o consumidor da fila:

1. agente local autenticado por tenant substituindo o consumidor navegador;
2. impressao ESC/POS silenciosa da `ticket_text`;
3. confirmacao idempotente via `printed` ou `failed` baseada no resultado real
   do dispositivo;
4. configuracao/wizard para escolher impressora, largura e teste de impressao.

O contrato ja esta dentro da API. Se o consumidor precisar de tipos
compartilhados com frontend/agente, reabrir a decisao antes de tocar em
`packages/contracts`.
