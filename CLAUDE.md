# CLAUDE.md — contexto compacto

Este arquivo fica curto de proposito para reduzir tokens. O contrato operacional detalhado esta em `AGENTS.md`; as fontes longas ficam em `docs/`.

Leia primeiro, sob demanda:

1. `docs/01-plano-produto.md`
2. `docs/02-definicoes-v1.md`
3. `docs/03-self-setup.md`
4. `docs/04-brand-design-system.md`
5. `docs/07-aprendizados.md` antes de migration, build, teste, infra, ou erro familiar.

Resumo rapido: Molho e SaaS multi-tenant brasileiro para cardapio digital, PDV e delivery. Stack: Turborepo + pnpm, Next.js 15, NestJS, Prisma, Postgres com RLS, Redis, BullMQ, Tempero UI. MVP usa PIX estatico/manual e WhatsApp click-to-chat humano. Producao: `molho.live`, fronts na Vercel, API longa na Fly.io `gru` com 2 maquinas, Neon Sao Paulo, Upstash Sao Paulo.

Nao duplique contexto extenso aqui; registre decisoes duraveis nos docs corretos.
