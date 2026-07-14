# 🟣 Molho

> **O ingrediente que transforma.**
> Plataforma de cardápio digital, PDV e delivery para restaurantes brasileiros.
> Mensalidade fixa, sem taxa por venda. O dinheiro cai direto na conta do lojista.

Monorepo do produto Molho — SaaS multi-tenant, mobile-first, com design inspirado em fintechs.

## Documentação

Toda decisão de produto está em [`docs/`](./docs). Leia nesta ordem:

| # | Documento | O que contém |
|---|---|---|
| 1 | [`01-plano-produto.md`](./docs/01-plano-produto.md) | Fonte da verdade: arquitetura, módulos, RBAC, pagamentos, roadmap, épicos e prompt do Claude Code |
| 2 | [`02-definicoes-v1.md`](./docs/02-definicoes-v1.md) | ICP, escopo do MVP, planos, regras de negócio, estrutura do contrato |
| 3 | [`03-self-setup.md`](./docs/03-self-setup.md) | Onboarding self-service, 4 templates de tema, billing |
| 4 | [`04-brand-design-system.md`](./docs/04-brand-design-system.md) | Marca, tom de voz, design system Tempero |

Assets da marca em [`brand-kit/`](./brand-kit) — logo Pingo no O, ícones de app, favicons, OG, loader animado.

## Stack

- **Monorepo:** Turborepo + pnpm
- **Frontends:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui customizado (Tempero)
- **Backend:** NestJS + Prisma + PostgreSQL (RLS multi-tenant) + Redis + BullMQ + Socket.io
- **Infra:** Vercel (fronts) · Neon (Postgres) · Upstash (Redis) · Cloudflare R2 (uploads) · Resend (e-mail)
- **Pagamentos (Fase 24+):** Asaas primário + Mercado Pago failover
- **WhatsApp (MVP):** click-to-chat (`wa.me`) — zero custo, zero risco de ban

## Primeira execução

```bash
# 1. Instalar dependências
pnpm install

# 2. Copiar variáveis de ambiente
cp .env.example .env.local
# → Preencha com as credenciais reais (nunca commite .env.local)

# 3. Subir infraestrutura local (Postgres + Redis)
docker compose up -d

# 4. Aplicar migrations e semear tenant demo
pnpm db:migrate
pnpm db:seed

# 5. Rodar tudo
pnpm dev
```

## Convenções

- **Um épico por sessão do Claude Code.** Ordem em [`docs/01-plano-produto.md`](./docs/01-plano-produto.md) §8.
- **Definition of Done de todo épico:** módulo registrado em `packages/contracts/modules.ts` + gate no backend (`@RequireModule` + `@RequirePermission`) + gate no front (`<Gate>`) + suíte "somente core" verde.
- **Dinheiro é sempre inteiro em centavos.** Nunca float.
- **RLS por tenant no Postgres** é a última linha de defesa.
- **Nada bloqueia o próximo passo no onboarding** — tudo pode ser retomado.

## Feito com Molho.

MIT · © 2026
