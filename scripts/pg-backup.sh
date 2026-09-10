#!/usr/bin/env bash
# NG-10 — dump lógico noturno do Neon produtivo para o R2 (`molho-backups`),
# retenção de 30 dias. Substitui a janela de restore que o Neon Free não dá
# (history = 6h). Ver docs/go-live/ata-ng-01.md §1 e docs/14 NG-10.
#
# Roda no GitHub Actions (cron). Precisa de:
#   BACKUP_DATABASE_URL    — conexão direta do Neon prod; role somente leitura
#                            com BYPASSRLS (ou owner Neon)
#   S3_ENDPOINT            — https://<accountid>.r2.cloudflarestorage.com
#   AWS_ACCESS_KEY_ID      — token R2 (Object Read & Write nos 2 buckets)
#   AWS_SECRET_ACCESS_KEY  — idem
# e o cliente `postgresql-client-18` + `awscli` no runner.
#
# RPO ≈ 24h (intervalo do cron). RTO: `gunzip | psql` numa branch Neon isolada.

set -euo pipefail

: "${BACKUP_DATABASE_URL:?BACKUP_DATABASE_URL ausente}"
: "${S3_ENDPOINT:?S3_ENDPOINT ausente}"
: "${AWS_ACCESS_KEY_ID:?AWS_ACCESS_KEY_ID ausente}"
: "${AWS_SECRET_ACCESS_KEY:?AWS_SECRET_ACCESS_KEY ausente}"

BUCKET="${R2_BACKUP_BUCKET:-molho-backups}"
PREFIX="neon"
RETENTION_DAYS="${RETENTION_DAYS:-30}"

ts="$(date -u +%Y%m%dT%H%M%SZ)"
file="molho-neon-${ts}.sql.gz"
tmp="$(mktemp -d)/${file}"

echo "==> pg_dump ${ts}"
pg_dump "$BACKUP_DATABASE_URL" --no-owner --no-privileges --format=plain | gzip -9 > "$tmp"
echo "    $(du -h "$tmp" | cut -f1)"

echo "==> upload s3://${BUCKET}/${PREFIX}/${file}"
aws s3 cp "$tmp" "s3://${BUCKET}/${PREFIX}/${file}" --endpoint-url "$S3_ENDPOINT"

echo "==> retenção: apaga > ${RETENTION_DAYS} dias"
cutoff="$(date -u -d "${RETENTION_DAYS} days ago" +%Y%m%d 2>/dev/null || date -u -v-"${RETENTION_DAYS}"d +%Y%m%d)"
aws s3 ls "s3://${BUCKET}/${PREFIX}/" --endpoint-url "$S3_ENDPOINT" \
  | awk '{print $4}' | grep -E '^molho-neon-[0-9]{8}T' | while read -r f; do
      d="${f#molho-neon-}"; d="${d%%T*}"
      if [ "$d" -lt "$cutoff" ]; then
        echo "    rm $f"
        aws s3 rm "s3://${BUCKET}/${PREFIX}/$f" --endpoint-url "$S3_ENDPOINT"
      fi
    done

rm -rf "$(dirname "$tmp")"
echo "==> ok"
