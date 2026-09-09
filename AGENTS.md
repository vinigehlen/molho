# AGENTS.md — contexto compacto do Codex

Molho = SaaS multi-tenant para cardapio digital, PDV e delivery de restaurantes brasileiros. ICP: restaurante/lanchonete com delivery proprio, R$ 40-150 mil/mes, hoje preso no WhatsApp manual. UX inspirada em fintech, produto em pt-BR informal.

## Fonte da Verdade

Leia sob demanda, nesta ordem:

1. `docs/01-plano-produto.md` — arquitetura, modulos, RBAC, roadmap.
2. `docs/02-definicoes-v1.md` — ICP, escopo MVP, planos, maquina de estados.
3. `docs/03-self-setup.md` — onboarding, temas, billing.
4. `docs/04-brand-design-system.md` — Tempero, tokens, componentes, voz.
5. `docs/07-aprendizados.md` — antes de migration, build, teste, infra, ou erro familiar.

Nao duplique contexto longo aqui. Registre detalhe duravel nos docs certos.

## Stack

- Monorepo Turborepo + pnpm: `apps/storefront`, `apps/backoffice`, `apps/api`, `packages/ui`, `packages/db`, `packages/contracts`.
- Fronts: Next.js 15 App Router + TS + Tailwind + shadcn/ui reestilizado com Tempero.
- API: NestJS + Prisma + Postgres/RLS por `tenant_id` + Redis + BullMQ + SSE/Socket.io.
- Testes: Vitest unit; Playwright e2e separado.

## Infra Decidida

- Fronts na Vercel. Backoffice staging: `https://staging-app.molho.live`, API staging: `https://api.staging.molho.live`.
- Producao usa `molho.live`: backoffice `app.molho.live`, API `api.molho.live`, storefront `{slug}.molho.live`.
- `apps/api` e processo Node longo, nunca serverless. Rodar na Fly.io `gru`, 2 maquinas sempre ligadas, rolling deploy.
- SSE exige Redis pub/sub + graceful shutdown: `app.enableShutdownHooks()`, streams fecham com `server_shutdown`.
- Neon deve ficar em `aws-sa-east-1`. Runtime usa URL pooled (`-pooler`, `?pgbouncer=true`) como `app_runtime`; migrations usam `DIRECT_URL` direto como `app_migrator`.
- Upstash confirmado em Sao Paulo em `docs/07`; pub/sub cross-instancia provado em staging real em 2026-09-08.
- `apps/api` nao carrega `.env.local` sozinho. `pnpm dev` usa `dotenv-cli`; producao vem da plataforma.
- CI e quality-only; deploy de API Fly e fronts Vercel sao passos separados.

## MVP

Dentro: cardapio, importacao CSV/XLSX, storefront, carrinho, endereco/zonas/horarios/minimo, checkout com PIX estatico manual, gestor realtime, impressao ESC/POS, WhatsApp click-to-chat, acompanhamento, onboarding self-service, 3 templates, assinatura/billing, super-admin.

Fora do MVP por default: cupons, fidelidade, promocoes, cartao online, KDS, PDV, caixa, garcom, motoboy, iFood, NFC-e, campanhas, franquias. Excecao: combos entrou no MVP por decisao de PM em 2026-08-28; fazer em fases pequenas com gate e deploy separados.

Roadmap atual: epicos 1-9b implementados/mesclados; 9c e infra real/staging. 10 impressao foi reposicionado para depois de 13d/14 e antes do go-live. Ver `docs/01-plano-produto.md` e handoffs recentes para estado fino.

## Regras Duras

- Modularidade: toda feature em `packages/contracts/modules.ts`; backend usa `@RequireModule`, frontend usa `<Gate>`, navegacao vem do registry. Estado ativo = entitled AND enabled AND released via `ModuleService.isModuleActive()`.
- RBAC: sempre `can(user, permission, { scope })`; nunca `if role`. Usar `@RequireModule` + `@RequirePermission`. Staff nasce sem papel no primeiro OTP; owner inicial nasce na criacao do tenant.
- Multi-tenancy: RLS em toda tabela com `tenant_id`. `users` e `user_roles` sao globais sem RLS; queries nelas sempre filtram escopo no banco.
- Separar identidades: staff = `users` + `user_roles` + `can()`; cliente = `customers` tenant-scoped. Nunca `is_customer` em `users`.
- Dinheiro sempre inteiro em centavos.
- MVP pagamento: PIX estatico/manual. Pedido nasce `received` com `payment_status='aguardando_confirmacao'`; lojista confirma pagamento; estorno manual ate PIX online.
- WhatsApp MVP = click-to-chat humano via `wa.me`. Nunca Cloud API ou API nao oficial. `MessagingProvider` e `ClickToChatProvider` sao portas diferentes.
- Adapters para externos: `PaymentProvider`, `MessagingProvider`, `ClickToChatProvider`, `MapsProvider`, `FiscalProvider`, `MarketplaceProvider`. Mock primeiro; real depois.
- LGPD: telefone/e-mail cifrado + lookup hash; nunca logar PII crua. Seletores hash sempre de `hashPhoneForLookup()`/`hashEmailForLookup()`, nunca variavel nullable lida do banco.
- Status de pedido so muda por funcao unica (`transitionOrderStatus`) que valida maquina de estados e grava auditoria. Nunca `UPDATE status` direto.
- Checkout: endereco anonimo em `localStorage` ate criar pedido. OTP no final, exceto modulo permissivo `checkout.guest`.
- `checkout.guest`: sem token = guest; token invalido = 401; token presente rejeita `customer` body com 400; nao emite sessao; `customer.phone` fica fora do schema compartilhado; escrita publica tem rate limit em middleware antes do geocode; gravar `phone_verified_at` e `orders.customer_verified`.
- Divergencia desfavoravel no checkout exige consentimento ativo antes de criar pedido. Preco/disponibilidade usam `SELECT ... FOR UPDATE` em `/checkout/orders`.

## Banco e Request Context

- PK = uuid v7. Indice composto com `tenant_id` comeca por `tenant_id`.
- Soft delete em tabelas mutaveis; uniques com soft delete viram indices unicos parciais SQL.
- `version int default 0` para optimistic locking.
- Migrations SQL a mao devem ser idempotentes. Fluxo seguro: `prisma migrate dev --create-only` -> editar SQL -> `prisma migrate deploy` -> `prisma generate`. Nunca `prisma migrate dev` liso em migration com SQL manual.
- `NEONDB_SHADOW_URL` precisa de PostGIS. Prisma client exige `moduleFormat = "cjs"`.
- Todo acesso DB em request path passa pelo client transacional do `RequestContextService`; Prisma global em `apps/api/src` e lint error, salvo excecoes de contexto/admin.
- Guards rodam antes de interceptors; guard com DB abre contexto proprio de plataforma.
- Nenhum I/O externo dentro de `RequestContextService.run()`. I/O pre-handler vive em middleware; rate limit por IP tambem em middleware antes do I/O.
- Em `apps/api/src/**`, `@typescript-eslint/consistent-type-imports` fica desligada porque Nest precisa de classes em runtime.

## Tempero

- Marca: Vermelho Brasa `#D63A1E`; white-label com 3 templates: Brasa, Folha `#0F8A5F`, Grafite `#141216`. Sem seletor livre de cor.
- Inter, numeros tabulares em PDV/caixa/dashboard. Cards 20px, botoes 14px, escala 4pt.
- Bottom sheets mobile, timeline vertical com dots animados, skeletons em loading.
- Copy pt-BR informal de restaurante. Sem emoji em UI/copy de produto; use icones da biblioteca.
- Use tokens de `packages/ui`; hex direto em apps e erro.

## Trabalho

- Ponytail, se usado, fica em `lite`.
- Um epico por sessao. Contratos/Prisma/zod antes da UI.
- Teste junto da feature. `*.e2e.test.ts` fica fora do `pnpm test` padrao.
- So reporte gate verde apos `pnpm lint && pnpm test && pnpm build`; `pnpm build` completo e obrigatorio.
- Nunca commitar `.env.local`/credenciais. Commits pequenos em pt-BR imperativo.
- Nao remover complexidades deliberadas sem aprovacao do PM: RLS, FKs compostas, snapshots de pedido, `order_status_history`, optimistic locking, contraste Playwright, locks de produto, indices parciais, erros especificos.

Sempre que houver dois caminhos razoaveis, explique a escolha em uma frase e implemente o mais simples que respeita estas regras.
