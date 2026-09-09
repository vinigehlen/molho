# Molho print-agent

Processo local que consome a fila `print_jobs` de um tenant e manda a comanda
pra impressora térmica da loja.

```
claim → ESC/POS → spooler do SO → printed/failed
```

Autentica com **credencial de dispositivo** (`molho_pd_...`, NG-06) — não é
token de staff, não expira, é revogável pelo backoffice.

## Variáveis

Obrigatórias:

| Var | Descrição |
|---|---|
| `MOLHO_API_URL` | base da API, ex. `https://api.staging.molho.live` (sem default de staging) |
| `MOLHO_PRINT_DEVICE_TOKEN` | credencial do dispositivo, do pareamento no backoffice |

Opcionais:

| Var | Default | Descrição |
|---|---|---|
| `MOLHO_TENANT_ID` | — | o token já identifica o tenant; se presente, a API confere |
| `MOLHO_PRINT_FORMAT` | `text` | `escpos` liga o transporte plug & play (spooler do SO) |
| `MOLHO_PRINTER_NAME` | auto | nome exato da fila/impressora; vazio = auto-detecção |
| `MOLHO_PRINT_CODEPAGE` | `cp850` | `cp850` / `cp860` (acento) ou `ascii` (sem acento, qualquer térmica) |
| `MOLHO_PRINT_COMMAND` | — | escape hatch: comando explícito (`lp`), bytes no stdin |
| `MOLHO_PRINT_ARGS` | `[]` | JSON array de args do comando (sem shell, sem interpolação) |
| `MOLHO_PRINT_WORKER_ID` | `agent:<tenant>` | id estável do worker |
| `MOLHO_PRINT_ONCE` | `0` | roda uma iteração e sai (diagnóstico) |
| `MOLHO_PRINT_POLL_MS` / `MOLHO_PRINT_LEASE_SECONDS` / `MOLHO_PRINT_HEALTH_EVERY` | `3000` / `120` / `20` | |

## Plug & play (Elgin/Bematech i7 e similares)

`MOLHO_PRINT_FORMAT=escpos` + `MOLHO_PRINT_DEVICE_TOKEN` bastam. O agente:

1. renderiza a comanda em ESC/POS (codepage cp850 por padrão → acento de verdade;
   corte parcial na guilhotina);
2. acha a impressora: `MOLHO_PRINTER_NAME` exato → primeira fila com cara de
   térmica (`i7`, `elgin`, `bematech`, `thermal`, `generic / text`, …) → primeira
   da lista;
3. manda os bytes RAW pelo spooler:
   - **macOS/Linux:** `lp -d <fila> -o raw`. A fila CUPS tem que existir — em
     macOS, adicione a impressora em Ajustes, ou:
     `lpadmin -p Molho_i7 -E -v "$(lpinfo -v | grep usb | head -1 | cut -d' ' -f2)" -m raw`
   - **Windows:** `WritePrinter` (winspool) com datatype RAW, via PowerShell —
     sem módulo nativo. Precisa do **driver da Elgin/Bematech instalado**
     (instalador assinado do fabricante).

Credencial revogada / inválida → o agente loga claro, faz backoff de 30s, e
depois de 5x seguidas sai com código 1 (o serviço mostra "parado").

## Cupom de teste (sem API, token nem tenant)

```bash
pnpm --filter @molho/print-agent build
MOLHO_PRINT_FORMAT=escpos pnpm --filter @molho/print-agent test-print
# opcional: MOLHO_PRINTER_NAME="Elgin i7"  MOLHO_PRINT_CODEPAGE=cp860
```

Sem `MOLHO_PRINT_FORMAT=escpos` roda em dry-run (imprime no stdout).

## Rodar a fila real

```bash
MOLHO_API_URL=https://api.staging.molho.live \
MOLHO_PRINT_DEVICE_TOKEN=molho_pd_... \
MOLHO_PRINT_FORMAT=escpos \
pnpm --filter @molho/print-agent start
```

Diagnóstico de uma iteração: `MOLHO_PRINT_ONCE=1 … start`.

## Limite atual

Sem instalador/serviço empacotado ainda — o operador técnico roda o processo.
Empacotar como executável único + serviço (Windows Service / LaunchAgent) é a
próxima fatia.
