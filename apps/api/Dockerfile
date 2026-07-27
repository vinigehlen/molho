# DRAFT (Épico 9c) — NÃO validado contra deploy real na Fly. Ver docs/08-plano-9c.md.
#
# apps/api é processo Node de vida longa (SSE + pub/sub) — nunca serverless.
# Multi-stage: builder instala tudo e compila; runner leva só o necessário.

# ── builder ────────────────────────────────────────────────────────────────
FROM node:22-slim AS builder
RUN corepack enable
WORKDIR /repo

# Manifests primeiro (cache de layer de deps). Copia o workspace inteiro de
# manifests — pnpm precisa do grafo pra resolver.
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/db/package.json packages/db/
COPY packages/contracts/package.json packages/contracts/
RUN pnpm install --frozen-lockfile

# Fonte + build. `db:generate` roda o prisma generate (client CJS, ver CLAUDE.md).
COPY . .
RUN pnpm --filter @molho/contracts build \
 && pnpm --filter @molho/db run db:generate \
 && pnpm --filter @molho/db build \
 && pnpm --filter @molho/api build
# Poda pra deps de produção só (dist + node_modules enxuto).
RUN pnpm --filter @molho/api --prod deploy /out

# ── runner ───────────────────────────────────────────────────────────────────
FROM node:22-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
# Usuário não-root.
RUN useradd -r -u 1001 molho
COPY --from=builder --chown=molho:molho /out/node_modules ./node_modules
COPY --from=builder --chown=molho:molho /repo/apps/api/dist ./dist
USER molho
EXPOSE 3333
# `start` = node dist/main; NÃO carrega .env.local (env vem dos secrets da Fly).
CMD ["node", "dist/main"]

# TODO(9c) a validar no deploy:
# - o `pnpm deploy --prod` leva o Prisma client gerado (packages/db) e o engine.
# - health check: hoje não há /health (ver docs/08 passo 3) — TCP check no fly.toml.
# - graceful shutdown: confirmar SIGTERM chegando (enableShutdownHooks já no código).
