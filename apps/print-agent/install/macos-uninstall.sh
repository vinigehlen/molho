#!/usr/bin/env bash
set -euo pipefail
PLIST="$HOME/Library/LaunchAgents/com.molho.print-agent.plist"
launchctl unload "$PLIST" 2>/dev/null || true
rm -f "$PLIST"
echo "print-agent removido. (log em ~/Library/Logs/molho-print-agent/ fica)"
