#!/usr/bin/env bash
#
# Instala o print-agent como LaunchAgent do macOS: sobe no login, reinicia
# sozinho se cair, e nunca mais precisa de terminal. Configura UMA vez.
#
#   ./macos-install.sh <MOLHO_PRINT_DEVICE_TOKEN> [NOME_DA_IMPRESSORA]
#
# Opcionais por env: MOLHO_API_URL (default staging), MOLHO_PRINT_CODEPAGE (cp850).
#
set -euo pipefail

TOKEN="${1:-}"
if [ -z "$TOKEN" ]; then
  echo "uso: $0 <MOLHO_PRINT_DEVICE_TOKEN> [NOME_DA_IMPRESSORA]" >&2
  exit 1
fi
PRINTER_NAME="${2:-}"
API_URL="${MOLHO_API_URL:-https://molho-api-staging.fly.dev}"
CODEPAGE="${MOLHO_PRINT_CODEPAGE:-cp850}"

AGENT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$AGENT_DIR/../.." && pwd)"
LABEL="com.molho.print-agent"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$HOME/Library/Logs/molho-print-agent"

command -v node >/dev/null || { echo "node não encontrado no PATH" >&2; exit 1; }
NODE_BIN="$(command -v node)"

echo "==> build do agente"
( cd "$REPO_ROOT" && pnpm --filter @molho/print-agent build )

mkdir -p "$LOG_DIR" "$(dirname "$PLIST")"

PRINTER_ENTRY=""
[ -n "$PRINTER_NAME" ] && PRINTER_ENTRY="    <key>MOLHO_PRINTER_NAME</key><string>${PRINTER_NAME}</string>"

cat > "$PLIST" <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${NODE_BIN}</string>
    <string>${AGENT_DIR}/dist/main.js</string>
  </array>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/usr/local/bin</string>
    <key>MOLHO_API_URL</key><string>${API_URL}</string>
    <key>MOLHO_PRINT_DEVICE_TOKEN</key><string>${TOKEN}</string>
    <key>MOLHO_PRINT_FORMAT</key><string>escpos</string>
    <key>MOLHO_PRINT_CODEPAGE</key><string>${CODEPAGE}</string>
${PRINTER_ENTRY}
  </dict>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>10</integer>
  <key>StandardOutPath</key><string>${LOG_DIR}/agent.log</string>
  <key>StandardErrorPath</key><string>${LOG_DIR}/agent.log</string>
</dict>
</plist>
EOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo
echo "==> instalado e rodando."
echo "    log:     tail -f ${LOG_DIR}/agent.log"
echo "    parar:   launchctl unload ${PLIST}"
echo "    religar: launchctl load ${PLIST}"
echo "    trocar credencial: rode este script de novo com o novo código."
