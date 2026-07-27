#!/usr/bin/env bash
#
# Falha se o código do atalho de auth SÓ-DEV (apps/backoffice/lib/dev-only-auth.ts)
# vazar pro bundle de PRODUÇÃO do backoffice.
#
# Por que existe: a eliminação do stub depende de dead-code por NODE_ENV (o guard
# `if (NODE_ENV !== 'development') return` no topo de cada handler do dev-login,
# ver docs/07). É propriedade DEPENDENTE DE CONFIG DE BUILD — regride em SILÊNCIO
# (um refactor no guard, um upgrade de webpack/Next) sem nada acusar. Mesma classe
# de falha silenciosa dos tokens Tailwind fantasma. Esta checagem a torna barulhenta.
#
# Sentinela = a mensagem do `throw` de dev-only-auth.ts. É STRING LITERAL (sobrevive
# à minificação, que só renomeia identificador) e ÚNICA do corpo do módulo. NÃO usar
# devRequestOtp/devVerifyOtp: esses nomes aparecem como resíduo inerte do interop de
# import dinâmico MESMO com o módulo eliminado (o corpo perigoso — fetch pro
# /v1/auth/otp, gravação de sessão — some; o identificador fica). Usá-los = falso
# positivo eterno.
set -euo pipefail

SENTINEL='dev-only-auth carregado num browser de produção'
SOURCE='apps/backoffice/lib/dev-only-auth.ts'
BUNDLE_DIR='apps/backoffice/.next/static'

# Auto-validação: se a sentinela não existe mais no fonte (mensagem do throw
# editada), a checagem estaria passando sem verificar NADA — falha barulhenta
# pedindo pra atualizar a sentinela, em vez de virar um no-op silencioso.
if ! grep -qF "$SENTINEL" "$SOURCE" 2>/dev/null; then
  echo "check-dev-stub: sentinela ausente de $SOURCE — a mensagem do throw mudou." >&2
  echo "Atualize SENTINEL neste script, senão ele passa sem verificar o bundle." >&2
  exit 1
fi

if [ ! -d "$BUNDLE_DIR" ]; then
  echo "check-dev-stub: $BUNDLE_DIR não existe — rode 'pnpm build' antes." >&2
  exit 1
fi

if grep -rlF "$SENTINEL" "$BUNDLE_DIR" 2>/dev/null; then
  echo "check-dev-stub: FALHA — o código do dev-only-auth vazou pro bundle de produção (arquivo(s) acima)." >&2
  echo "A eliminação por dead-code (NODE_ENV) regrediu. Ver docs/07 e $SOURCE." >&2
  exit 1
fi

echo "check-dev-stub: OK — dev-only-auth ausente do bundle de produção do backoffice."
