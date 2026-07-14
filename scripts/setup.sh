#!/usr/bin/env bash
# Molho — script de primeira execução
set -e
echo "🟣 Molho — Setup inicial"
echo ""
if [ ! -f .env.local ]; then
  echo "→ Criando .env.local a partir de .env.example"
  cp .env.example .env.local
  echo "  ⚠️  Preencha as credenciais em .env.local antes de continuar."
  echo ""
fi
if ! command -v pnpm &> /dev/null; then
  echo "→ pnpm não encontrado. Instalando via corepack..."
  corepack enable
  corepack prepare pnpm@latest --activate
fi
echo "→ pnpm install"
pnpm install
echo "→ docker compose up -d (Postgres + Redis local)"
docker compose up -d
echo ""
echo "✅ Setup concluído."
echo "Rode 'pnpm dev' para começar."
