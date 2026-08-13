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
- `MOLHO_PRINT_ARGS`: JSON array de argumentos para o comando;
- `MOLHO_PRINT_FORMAT`: `text` ou `escpos`. Default: `text`.

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

## Saida ESC/POS basica

Quando o comando local aceita bytes crus da impressora termica, use:

```bash
MOLHO_API_URL=https://api.staging.molho.live \
MOLHO_STAFF_ACCESS_TOKEN=... \
MOLHO_TENANT_ID=... \
MOLHO_PRINT_COMMAND=lp \
MOLHO_PRINT_ARGS='["-d","Cozinha","-o","raw"]' \
MOLHO_PRINT_FORMAT=escpos \
pnpm --filter @molho/print-agent start
```

O modo `escpos` aplica:

- inicializacao da impressora (`ESC @`);
- alinhamento a esquerda;
- texto normal;
- linhas de avanco;
- corte parcial quando o job vem com `cut=true`.

Para reduzir mojibake entre impressoras brasileiras diferentes, a primeira
versao normaliza acentos para ASCII (`Búrguer` vira `Burguer`) em vez de tentar
adivinhar a codepage do equipamento. Codepage configuravel entra quando a
impressora do piloto estiver definida.

## Cupom de teste local

Depois do build, da para testar a impressora sem API, token ou tenant:

```bash
pnpm --filter @molho/print-agent build
MOLHO_PRINT_COMMAND=lp \
MOLHO_PRINT_ARGS='["-d","Cozinha","-o","raw"]' \
MOLHO_PRINT_FORMAT=escpos \
pnpm --filter @molho/print-agent test-print
```

Sem `MOLHO_PRINT_COMMAND`, `test-print` roda em dry-run. Em `text`, imprime a
comanda de teste no stdout; em `escpos`, imprime os bytes em hexadecimal.

## Limite atual

Esta fatia ainda nao empacota instalador, login proprio, service manager nem
driver ESC/POS especifico por fabricante. Ela fecha a ponte local basica da
fila:

```text
claim -> text/escpos -> print command/stdout -> printed/failed
```
