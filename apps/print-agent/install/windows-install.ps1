<#
  Instala o print-agent no Windows como Tarefa Agendada: sobe no logon,
  reinicia sozinho se cair, roda escondido. Configura UMA vez.

    powershell -ExecutionPolicy Bypass -File windows-install.ps1 -Token "molho_pd_..." [-PrinterName "Elgin i7"]

  Opcionais: -ApiUrl (default staging), -Codepage (cp850).
  Pré-requisito: driver da impressora (Elgin/Bematech) instalado, e Node no PATH.
#>
param(
  [Parameter(Mandatory = $true)][string]$Token,
  [string]$PrinterName = "",
  [string]$ApiUrl = "https://molho-api-staging.fly.dev",
  [string]$Codepage = "cp850"
)

$ErrorActionPreference = "Stop"
$agentDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$repoRoot = (Resolve-Path (Join-Path $agentDir "..\..")).Path
$taskName = "MolhoPrintAgent"
$logDir   = Join-Path $env:LOCALAPPDATA "molho-print-agent"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null

$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw "node não encontrado no PATH" }

Write-Host "==> build do agente"
Push-Location $repoRoot
& pnpm --filter "@molho/print-agent" build
Pop-Location

# Envelope .cmd: seta as variáveis e chama o node. A Tarefa Agendada chama o .cmd.
$runner = Join-Path $logDir "run-agent.cmd"
$printerLine = if ($PrinterName) { "set MOLHO_PRINTER_NAME=$PrinterName" } else { "" }
@"
@echo off
set MOLHO_API_URL=$ApiUrl
set MOLHO_PRINT_DEVICE_TOKEN=$Token
set MOLHO_PRINT_FORMAT=escpos
set MOLHO_PRINT_CODEPAGE=$Codepage
$printerLine
"$($node.Source)" "$agentDir\dist\main.js" >> "$logDir\agent.log" 2>&1
"@ | Set-Content -Encoding ASCII $runner

$action    = New-ScheduledTaskAction -Execute $runner
$trigger   = New-ScheduledTaskTrigger -AtLogOn
$settings  = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
              -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
              -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive -RunLevel Limited

Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal | Out-Null
Start-ScheduledTask -TaskName $taskName

Write-Host ""
Write-Host "==> instalado e rodando."
Write-Host "    log:     Get-Content -Wait `"$logDir\agent.log`""
Write-Host "    parar:   Stop-ScheduledTask -TaskName $taskName"
Write-Host "    remover: Unregister-ScheduledTask -TaskName $taskName -Confirm:`$false"
Write-Host "    trocar credencial: rode este script de novo com o novo código."
