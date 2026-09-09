# Impressora da loja — instalação do agente (piloto)

Como deixar a impressão de comanda funcionando no computador da loja, uma vez,
sem precisar mexer de novo. Vale para a Elgin/Bematech i7 e qualquer térmica
ESC/POS 80mm com USB.

## Como funciona

```
pedido novo / botão "Imprimir" no gestor
        ↓
API cria um job na fila durável (print_jobs, no Postgres)
        ↓
agente no PC da loja (serviço, sempre ligado)
  → puxa job a cada ~3s
  → manda ESC/POS cru pra impressora
  → marca "impresso"
```

- O agente autentica com uma **credencial de dispositivo** (`molho_pd_...`) que
  **não expira** e é revogável no backoffice (Configuração → Impressora).
- Rede caiu ou PC reiniciou: o agente reconecta e retoma sozinho. Os jobs ficam
  na fila esperando — nada se perde.
- O lojista só volta a mexer se: revogar e parear de novo, ou trocar de
  computador.

## Parear (backoffice, uma vez)

1. Backoffice → **Configuração → Impressora → Dispositivos de impressão**.
2. **Parear dispositivo** → dê um nome (ex.: "Cozinha").
3. Copie o código `molho_pd_...` — ele aparece **uma vez só**.

Esse código vai no instalador do agente, abaixo.

---

## macOS

Pré-requisitos: a impressora adicionada em **Ajustes → Impressoras** (ou uma fila
CUPS raw), Node.js no PATH, o repo clonado com `pnpm install` feito.

```bash
apps/print-agent/install/macos-install.sh molho_pd_SEU_CODIGO "Elgin i7"
```

O 2º argumento (nome da impressora) é opcional — sem ele, o agente auto-detecta.

Instala um **LaunchAgent**: sobe no login, reinicia sozinho se cair, roda sem
terminal.

| Ação | Comando |
|---|---|
| Ver o log | `tail -f ~/Library/Logs/molho-print-agent/agent.log` |
| Parar | `launchctl unload ~/Library/LaunchAgents/com.molho.print-agent.plist` |
| Religar | `launchctl load ~/Library/LaunchAgents/com.molho.print-agent.plist` |
| Remover | `apps/print-agent/install/macos-uninstall.sh` |
| Trocar credencial | rodar o instalador de novo com o código novo |

---

## Windows

O modelo é o mesmo. Três diferenças em relação ao macOS:

| | macOS | Windows |
|---|---|---|
| Driver da impressora | dispensado (CUPS raw) | **obrigatório** — instalador da Elgin |
| Serviço | LaunchAgent | Tarefa Agendada (gatilho: logon) |
| Log | `~/Library/Logs/molho-print-agent/agent.log` | `%LOCALAPPDATA%\molho-print-agent\agent.log` |

### Pré-requisitos (uma vez, na máquina da loja)

1. **Driver da i7** — baixar em elgin.com.br → "Impressora i7" → instalar. Cria
   uma fila de impressão no Windows (normalmente chamada "Elgin i7"). Testar:
   Bloco de Notas → Imprimir → escolher a i7 → tem que sair papel.
2. **Node.js LTS** — nodejs.org, instalador padrão (deixar marcado "Add to
   PATH").
3. **Repo do Molho** clonado, `corepack enable` e `pnpm install` na raiz. (Esse
   passo some quando o agente virar executável único.)
4. **Código do dispositivo** — do pareamento acima.

### Instalar

PowerShell **como o usuário da loja** (não precisa de admin), na raiz do repo:

```powershell
powershell -ExecutionPolicy Bypass -File apps\print-agent\install\windows-install.ps1 `
  -Token "molho_pd_SEU_CODIGO" `
  -PrinterName "Elgin i7"
```

- `-PrinterName` = nome exato em **Painel de Controle → Dispositivos e
  Impressoras**. Omitir → o agente auto-detecta (procura "i7", "elgin",
  "bematech", "generic / text").
- Opcionais: `-ApiUrl` (default: staging), `-Codepage` (`cp850` default, ou
  `cp860` se o acento sair errado).

O script: builda o agente → cria um `.cmd` com as variáveis de ambiente →
registra a Tarefa Agendada `MolhoPrintAgent` (gatilho: logon; reinício
automático a cada 1 min se cair; sem limite de tempo de execução) → inicia.

### Verificar

```powershell
Get-Content -Wait "$env:LOCALAPPDATA\molho-print-agent\agent.log"
```

Deve mostrar `Molho print-agent iniciado ...` e depois `idle` ou linhas de
`impresso`.

**Teste de reboot:** reiniciar o PC, fazer login, conferir o log — o agente tem
que voltar sozinho.

### Gerenciar

| Ação | Comando (PowerShell) |
|---|---|
| Parar | `Stop-ScheduledTask -TaskName MolhoPrintAgent` |
| Religar | `Start-ScheduledTask -TaskName MolhoPrintAgent` |
| Remover | `Unregister-ScheduledTask -TaskName MolhoPrintAgent -Confirm:$false` |
| Trocar credencial | rodar o instalador de novo com o novo `-Token` |
| Ver na interface | Agendador de Tarefas → `MolhoPrintAgent` |

### Ressalvas do piloto

- **O gatilho é "no logon"** — o PC da loja precisa fazer login automático (ou
  alguém logar) pra o agente subir. Um Serviço do Windows de verdade rodaria
  antes do login; a Tarefa Agendada é o caminho sem dependência extra. Para uma
  loja com PC sempre ligado e um usuário logado, resolve.
- **O log não rotaciona** — cresce devagar; limpar de vez em quando, ou
  adicionar rotação depois.
- Se o script reclamar de `pnpm` não encontrado: `corepack enable` primeiro.
- A impressão RAW usa `WritePrinter`/winspool (padrão consolidado do Windows).
  Se der erro na primeira execução, guardar o `agent.log`.

---

## Diagnóstico

Rodar o agente solto, fora do serviço, uma iteração e sai:

```bash
MOLHO_API_URL=https://molho-api-staging.fly.dev \
MOLHO_PRINT_DEVICE_TOKEN=molho_pd_... \
MOLHO_PRINT_FORMAT=escpos \
MOLHO_PRINT_ONCE=1 \
pnpm --filter @molho/print-agent start
```

Cupom de teste, sem API nem token (só testa a ponte PC → impressora):

```bash
pnpm --filter @molho/print-agent build
MOLHO_PRINT_FORMAT=escpos pnpm --filter @molho/print-agent test-print
# opcional: MOLHO_PRINTER_NAME="Elgin i7"  MOLHO_PRINT_CODEPAGE=cp860
```

| Sintoma | Causa provável |
|---|---|
| `credencial de impressão inválida ou revogada` (401) | token errado, ou dispositivo revogado no backoffice — parear de novo |
| `Nenhuma fila CUPS` / `Nenhuma impressora no Windows` | impressora não adicionada / driver não instalado; ou passar `MOLHO_PRINTER_NAME` |
| `Módulo "printing.escpos" não está ativo` (403) | módulo de impressão desligado pra essa loja |
| imprime, mas acento sai trocado | trocar `MOLHO_PRINT_CODEPAGE` para `cp860` |
| pedido diz "2ª via na fila" e nada sai | o agente não está rodando — verificar o serviço e o log |

## Empacotamento (próxima fatia)

Hoje o instalador ainda exige o repo + pnpm + Node na máquina da loja.
Empacotar como **executável único** (Node SEA) — um instalador `.exe`/`.pkg` que
o lojista roda com dois cliques e digita o código — é o passo seguinte.
