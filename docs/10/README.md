# 10 — Impressao de comandas

Desenho aprovado para a fila duravel de impressao do pedido.

## Escopo

O MVP precisa imprimir comanda de cozinha/balcao/caixa quando um pedido novo
chega, e permitir segunda via a qualquer momento por acao manual do operador.

Este epico nao implementa ESC/POS/tipagem de impressora no browser. A tabela
`print_jobs` guarda uma comanda ja renderizada em texto (`ticket_text`) e o
agente/consumidor local reivindica os jobs da fila.

## Divisao de responsabilidade

- `packages/db`: dono do schema, migration `print_jobs` e RLS.
- `apps/api/src/printing/`: dono das rotas, montagem da comanda, claim, lease e
  conclusao idempotente.
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

Segunda via e sempre manual: o operador clica em "Imprimir", a API cria outro
`print_job` para o mesmo pedido com outra `idempotency_key`, e o agente imprime.

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

