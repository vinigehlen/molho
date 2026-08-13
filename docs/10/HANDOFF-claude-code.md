# Handoff para Claude Code — Epico 10, impressao de comandas

Este documento resume o que ja foi feito no Epico 10 para que outro agente
continue sem redescobrir contexto. A fonte detalhada continua em
`docs/10/README.md`.

## Resumo executivo

O Epico 10 ja tem a fila duravel de impressao funcionando ponta a ponta:

```text
pedido novo / segunda via
  -> print_jobs
  -> claim com FOR UPDATE SKIP LOCKED
  -> agente local ou fallback navegador
  -> printed/failed com optimistic lock
```

O caminho aprovado continua sendo:

- `packages/db`: dono unico de schema, migration e RLS;
- `apps/api/src/printing/`: rotas, montagem da comanda, claim, lease,
  idempotencia e status operacional;
- `apps/backoffice`: botao de segunda via, fallback navegador e wizard
  operacional;
- `apps/print-agent`: agente local para consumir a fila e mandar para comando
  local/ESC-POS.

Nao criar contrato compartilhado em `packages/contracts` sem reabrir a decisao.
Os DTOs seguem internos ao modulo de API.

## Commits importantes ja existentes

- `be2caae` — cria a tabela `print_jobs` com RLS, `version`, `leased_by`, FK
  composta e indice FIFO parcial. Feito pelo Claude Code; schema/RLS pertence a
  ele.
- `1d48e79` — documenta a fila duravel de impressao.
- `7b30581` — adiciona o modulo `apps/api/src/printing/`.
- `1e0c0e3` — cobre concorrencia/RLS com e2e da fila.
- `09c86f5` — enfileira segunda via pelo gestor.
- `0bae0ad` — adiciona consumidor navegador no gestor.
- `f09fc5c` — adiciona `apps/print-agent`.
- `8888e5e` — adiciona saida ESC/POS basica ao agente.
- `bae8716` — adiciona cupom de teste local ao agente.
- `44c6ad0` — adiciona wizard de configuracao da impressora.
- `edf57d9` — facilita copiar comandos do wizard.

Depois desses commits, ha uma fatia em andamento neste workspace com:

- modo diagnostico do agente (`MOLHO_PRINT_ONCE=1`);
- health log periodico no agente;
- endpoint `GET /v1/admin/printing/status`;
- card de status da fila no wizard;
- checklist da loja piloto em `docs/10/README.md`.

Confira `git status` antes de continuar, porque essa fatia pode estar
uncommitted.

## API de impressao

Modulo:

```text
apps/api/src/printing/
```

Rotas ja implementadas:

```text
POST /v1/admin/printing/orders/:orderId/jobs
POST /v1/admin/printing/jobs/claim
POST /v1/admin/printing/jobs/:id/printed
POST /v1/admin/printing/jobs/:id/failed
GET  /v1/admin/printing/status
```

Todas passam por:

- `JwtAuthGuard`;
- `RequireModuleGuard`;
- `RequirePermissionGuard`;
- `TenantContextInterceptor`;
- `@RequireModule('printing.escpos')`;
- `@RequirePermission('order.view')`.

### Claim

O claim usa `FOR UPDATE SKIP LOCKED` em SQL cru via Prisma, dentro do contexto
RLS/tenant ativo. Elegiveis:

- `queued`;
- `printing` com `lease_until < now()`.

Ao reivindicar:

- status vira `printing`;
- seta `leased_by`;
- seta `lease_until`;
- incrementa `attempts`;
- limpa `last_error`;
- incrementa `version`.

### Conclusao

`printed` e `failed` usam optimistic lock:

```sql
WHERE id = ?
  AND version = ?
  AND status = 'printing'
  AND leased_by = ?
  AND deleted_at IS NULL
```

Zero linhas afetadas vira conflito benigno (`409`) para o worker, nunca sucesso
cego.

### Status operacional

`GET /v1/admin/printing/status` resume:

- `queued`;
- `printing`;
- `failed`;
- `stalePrinting`;
- `oldestQueuedAt`;
- `lastFailureAt`;
- `lastError`.

Este endpoint e somente leitura. Nao reprocessa, nao conclui, nao altera estado.

## Comanda

Montagem em:

```text
apps/api/src/printing/print-ticket.ts
```

A comanda e snapshot no momento de criacao do `print_job`.

Permitido:

- numero/id curto do pedido;
- hora;
- tipo entrega/retirada;
- nome do cliente;
- itens;
- quantidades;
- modificadores;
- observacoes.

Proibido:

- preco;
- total;
- telefone;
- endereco.

## Enfileiramento automatico

O checkout toca a impressao apenas depois que o pedido foi criado com sucesso.
A primeira via usa idempotency key:

```text
order:{orderId}:kitchen:v1
```

Com `printing.escpos` desligado, nao cria job.

Pedido guest e pedido verificado seguem o mesmo caminho de impressao, porque o
job nasce a partir do pedido persistido.

## Segunda via no gestor

Arquivo principal:

```text
apps/backoffice/app/gestor/page.tsx
```

O botao vive no `OrderCard` como `🖨️ Imprimir`. Ele chama:

```text
apps/backoffice/lib/printing-api.ts
queueKitchenTicketCopy(orderId, idempotencyKey)
```

Cada clique gera chave nova:

```text
manual:{orderId}:{randomUUID}
```

Reimpressao nao consome estado:

- nao muda status do pedido;
- nao confirma pagamento;
- nao altera fluxo operacional;
- nao invalida a primeira via.

## Fallback navegador

Arquivo:

```text
apps/backoffice/app/gestor/print-job-consumer.tsx
```

Ele prova o circuito da fila no browser:

```text
claim -> window.print() -> printed/failed
```

Limite importante: browser nao da confirmacao fisica confiavel. Se o operador
cancela o dialogo, o `afterprint`/fallback pode mesmo assim marcar como enviado.
Para o piloto real, a impressao confiavel e pelo agente local.

## Wizard do gestor

Arquivo:

```text
apps/backoffice/app/gestor/impressao/page.tsx
```

O gestor tem link `🖨️ Impressão` no topo da pagina de pedidos.

O wizard mostra:

- explicacao do caminho atual;
- comandos para cupom de teste local;
- comandos para ligar a fila real;
- botoes de copiar comando;
- status operacional da fila.

Ele nao faz pareamento remoto, nao persiste configuracao e nao instala agente.
Isso e deliberado para manter a fatia do piloto pequena.

## Agente local

App:

```text
apps/print-agent/
```

Scripts:

```bash
pnpm --filter @molho/print-agent build
pnpm --filter @molho/print-agent start
pnpm --filter @molho/print-agent start:once
pnpm --filter @molho/print-agent test-print
pnpm --filter @molho/print-agent test
```

Variaveis obrigatorias para consumir a fila real:

```text
MOLHO_API_URL
MOLHO_STAFF_ACCESS_TOKEN
MOLHO_TENANT_ID
```

Variaveis de impressao:

```text
MOLHO_PRINT_COMMAND
MOLHO_PRINT_ARGS
MOLHO_PRINT_FORMAT=text|escpos
MOLHO_PRINT_WORKER_ID
MOLHO_PRINT_WIDTH
MOLHO_PRINT_LEASE_SECONDS
MOLHO_PRINT_POLL_MS
MOLHO_PRINT_ONCE
MOLHO_PRINT_HEALTH_EVERY
```

`MOLHO_PRINT_COMMAND` executa comando local sem shell. `MOLHO_PRINT_ARGS` deve
ser JSON array de strings para evitar interpolacao perigosa.

Sem `MOLHO_PRINT_COMMAND`, roda em dry-run.

### Cupom de teste local

Nao precisa de API/token/tenant:

```bash
pnpm --filter @molho/print-agent build
MOLHO_PRINT_COMMAND=lp \
MOLHO_PRINT_ARGS='["-d","Cozinha","-o","raw"]' \
MOLHO_PRINT_FORMAT=escpos \
pnpm --filter @molho/print-agent test-print
```

### Diagnostico de uma iteracao

```bash
MOLHO_PRINT_ONCE=1 \
MOLHO_API_URL=https://api.staging.molho.live \
MOLHO_STAFF_ACCESS_TOKEN=... \
MOLHO_TENANT_ID=... \
MOLHO_PRINT_COMMAND=lp \
MOLHO_PRINT_ARGS='["-d","Cozinha","-o","raw"]' \
MOLHO_PRINT_FORMAT=escpos \
pnpm --filter @molho/print-agent start
```

## ESC/POS atual

Arquivo:

```text
apps/print-agent/src/escpos.ts
```

Suporte propositalmente minimo:

- `ESC @`;
- alinhamento a esquerda;
- texto normal;
- avanco de linhas;
- corte parcial quando `cut=true`.

Por enquanto normaliza acentos para ASCII para evitar mojibake antes de escolher
a impressora do piloto. Codepage configuravel fica para depois que o hardware
for definido.

## Gates ja rodados nesta fatia

Antes deste handoff, foram rodados:

```bash
CI=true pnpm --filter @molho/print-agent test
CI=true pnpm --filter @molho/print-agent typecheck
CI=true pnpm --filter @molho/print-agent build
CI=true pnpm --filter @molho/backoffice test -- lib/printing-api.test.ts
CI=true pnpm --filter @molho/backoffice typecheck
CI=true pnpm --filter @molho/api typecheck
CI=true pnpm lint
CI=true pnpm test
CI=true pnpm build
```

Observacao: `CI=true pnpm test` falhou dentro do sandbox nos testes
`bootstrap/trust-proxy` e `bootstrap/security-headers` por `listen EPERM:
operation not permitted 0.0.0.0`. Repetido fora do sandbox, passou:

```text
@molho/api: 55 files, 382 tests passed
```

## Coisas para nao fazer sem reabrir desenho

- Nao tocar migration/RLS de `print_jobs` sem coordenar com dono de schema.
- Nao mover DTOs para `packages/contracts` sem necessidade real.
- Nao colocar telefone, endereco, preco ou total na comanda.
- Nao transformar o fallback browser em fonte de verdade para impressao fisica.
- Nao implementar Cloud API/WhatsApp automatico aqui; isso nao faz parte do
  Epico 10.
- Nao criar pareamento remoto do agente sem desenho novo de auth/seguranca.
- Nao usar shell string para imprimir; manter comando + args separados.

## Proximos passos naturais

1. Commitar a fatia em andamento, se ainda estiver uncommitted.
2. Validar manualmente o `test-print` numa impressora real da loja piloto.
3. Escolher hardware/modelo da termica e decidir codepage.
4. Decidir como o agente sera mantido rodando no piloto:
   - terminal manual;
   - launchd/systemd;
   - futuro instalador.
5. Depois do piloto, reavaliar pareamento remoto e status real de agente online.
