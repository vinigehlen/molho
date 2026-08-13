# Molho print-agent

Agente local simples para consumir a fila duravel `print_jobs`.

Ele autentica como staff de um tenant, reivindica jobs via API, envia
`ticketText` para uma impressora/comando local e confirma `printed` ou `failed`.

## Variaveis

Obrigatorias:

- `MOLHO_API_URL`: base da API, exemplo `https://api.staging.molho.live`;
- `MOLHO_STAFF_ACCESS_TOKEN`: access token de staff;
- `MOLHO_TENANT_ID`: tenant ativo.

Opcionais:

- `MOLHO_PRINT_WORKER_ID`: id estavel do worker. Default: `agent:{tenantId}`;
- `MOLHO_PRINT_WIDTH`: largura pedida no claim. Default: `80`;
- `MOLHO_PRINT_LEASE_SECONDS`: lease do job. Default: `120`;
- `MOLHO_PRINT_POLL_MS`: intervalo entre polls. Default: `3000`;
- `MOLHO_PRINT_COMMAND`: comando local de impressao;
- `MOLHO_PRINT_ARGS`: JSON array de argumentos para o comando.

## Dry-run

Sem `MOLHO_PRINT_COMMAND`, o agente so escreve a comanda no stdout:

```bash
MOLHO_API_URL=https://api.staging.molho.live \
MOLHO_STAFF_ACCESS_TOKEN=... \
MOLHO_TENANT_ID=... \
pnpm --filter @molho/print-agent start
```

## Impressao via comando do sistema

Exemplo com `lp`, mandando o texto pelo stdin:

```bash
MOLHO_API_URL=https://api.staging.molho.live \
MOLHO_STAFF_ACCESS_TOKEN=... \
MOLHO_TENANT_ID=... \
MOLHO_PRINT_COMMAND=lp \
MOLHO_PRINT_ARGS='["-d","Cozinha"]' \
pnpm --filter @molho/print-agent start
```

O agente nao usa shell para executar o comando. `MOLHO_PRINT_ARGS` e JSON para
evitar interpolacao de string e reduzir risco de injecao.

## Limite atual

Esta fatia ainda nao empacota instalador, login proprio, service manager nem
driver ESC/POS nativo. Ela fecha a ponte local basica da fila:

```text
claim -> print command/stdout -> printed/failed
```
