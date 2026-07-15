# CLAUDE.md — Contexto para o Claude Code

Você está no monorepo do **Molho**, uma plataforma SaaS multi-tenant de cardápio digital, PDV e delivery para restaurantes brasileiros. Design inspirado em fintechs (Nubank). Cliente-alvo: restaurante com delivery próprio, R$ 40–150 mil/mês, que hoje anota pedido no WhatsApp na mão.

## Leia primeiro (fonte da verdade)

Antes de qualquer decisão de arquitetura ou implementação, consulte `docs/` nesta ordem:

1. **`docs/01-plano-produto.md`** — arquitetura completa, catálogo de módulos, RBAC, roadmap dos 27 épicos, regras de pagamentos, prompt integral
2. **`docs/02-definicoes-v1.md`** — ICP, escopo do MVP, planos e preços, máquina de estados de pedido, regras de cancelamento
3. **`docs/03-self-setup.md`** — onboarding self-service em 7 passos, 4 templates de tema, billing
4. **`docs/04-brand-design-system.md`** — tokens, componentes, tom de voz, léxico

Assets em `brand-kit/`.

## Stack obrigatória

- Monorepo **Turborepo + pnpm** com: `apps/storefront`, `apps/backoffice`, `apps/api`, `packages/ui`, `packages/db`, `packages/contracts`
- Frontends: **Next.js 15 App Router + TS + Tailwind + shadcn/ui** re-estilizado com o design system Tempero
- Backend: **NestJS + Prisma + PostgreSQL (RLS por `tenant_id`) + Redis + BullMQ + Socket.io**
- Testes: **Vitest** (unit) + **Playwright** (e2e do fluxo de pedido)

## Infra ativa (dev)

- **Vercel:** `https://molho.vercel.app` (fronts)
- **Neon:** Postgres (URL em `.env.local`)
- **Upstash:** Redis (URL em `.env.local`)
- **Cloudflare R2:** bucket `molho-uploads` (credenciais em `.env.local`)
- **Resend:** e-mail transacional

No dev, cada tenant é servido em rota: `molho.vercel.app/{slug}`. Em produção futura será `{slug}.molho.store` (a lógica de resolução de tenant deve ser configurável para trocar sem refactor).

## Escopo do MVP (semanas 1–8, épicos 1–14)

**Dentro:** cardápio (categorias, produtos, fotos, variações, esgotado manual) · importação de cardápio por CSV/XLSX · storefront (menu, carrinho, bottom sheets) · endereços com pin e zonas de entrega (polígonos) · horários e pedido mínimo · checkout com **PIX estático** (chave do lojista, confirmação manual) · gestor de pedidos realtime com push/som/fila offline · impressão ESC/POS com wizard · notificações de status via **WhatsApp click-to-chat** · página de acompanhamento · onboarding self-service em 7 passos · **4 templates de tema** (Roxo, Brasa, Folha, Grafite) · **assinatura e billing** (trial 7 dias, cobrança recorrente, dunning) · super-admin.

**Fora do MVP** (registrar como módulos DESLIGADOS, não implementar): cupons, fidelidade, promoções, combos, cartão online, KDS, PDV, caixa, garçom, motoboy, iFood, NFC-e, campanhas, franquias. Entram nas fases 2–4.

## Regras críticas (não-negociáveis)

1. **Modularidade desde o dia 1.** Toda feature é um MÓDULO em `packages/contracts/modules.ts` com `plans`, `requires`, `default`, `addon`. Backend com `@RequireModule('key')`; frontend com `<Gate module="key" fallback={<Upsell/>}>`; a navegação do backoffice é GERADA do registry, nunca hardcoded. Módulo desligado é não-destrutivo (congela dados, não apaga). `ModuleService.isModuleActive(tenantId, key)` (`packages/db`) é quem responde "entitled AND enabled AND released" — nunca reimplementar essa checagem inline. **Invalidação de cache é automática, não manual:** o Prisma Client de produção sempre passa por `withModuleInvalidation()` (extensão `$extends`), que detecta escrita em `tenant_entitlements`/`tenant_settings` e chama `ModuleService.invalidate(tenantId)` sozinho — isso é rede de segurança pra quem escrever `prisma.tenantSetting.update()` em código novo sem lembrar de invalidar. `feature_flags` não tem `tenant_id`; escrita nele só loga e espera o TTL de 60s do Redis expirar.
2. **RBAC granular.** Sempre `can(user, 'permission', {scope})`, nunca `if (role === 'x')`. Papéis são conjuntos de permissões em `packages/contracts/permissions.ts`. Dupla checagem: `@RequireModule + @RequirePermission`. RLS no Postgres como última linha.
3. **Multi-tenancy.** `user_roles(user_id, role, scope_type, scope_id)`. RLS por `tenant_id` no Postgres em toda tabela com esse campo. Escrever testes explícitos de isolamento entre tenants. **Exceção deliberada:** `users` e `user_roles` NÃO têm `tenant_id` (identidade é global — `platform_support` e franquia atuam em vários tenants) e por isso NÃO têm RLS. Toda query em `user_roles` exige escopo explícito no `WHERE` (por `scope_id`/`scope_type`) — nunca ler a tabela inteira e filtrar em memória. É a única camada sem RLS como rede de segurança; erro aqui vaza entre tenants de verdade.
4. **Dinheiro é INTEIRO em centavos.** Nunca float. Sempre.
5. **Pagamento no MVP** (até o épico 24): PIX ESTÁTICO com confirmação manual. O pedido nasce direto como `received` com `payment_status: 'aguardando_confirmacao'`; o lojista marca "pago" ao conferir o app do banco; estorno é manual (devolução Pix pelo lojista). Auto-cancel em 10min e estorno automático só passam a valer com o PIX online (épico 24).
6. **WhatsApp no MVP = click-to-chat.** O sistema NUNCA envia mensagem sozinho: monta o texto e abre `https://wa.me/{fone}?text={msg}` para o lojista tocar em enviar, pelo número normal dele. NÃO usar Cloud API nem API não-oficial (Baileys/Evolution).
7. **Idempotência ponta a ponta.** `Idempotency-Key` em cobranças; webhooks tratados com deduplicação por `psp_ref`.
8. **Adapters plugáveis** para todo serviço externo: `PaymentProvider`, `MessagingProvider`, `MapsProvider`, `FiscalProvider`, `MarketplaceProvider`. Implementação **mock** primeiro; adapter real depois.
9. **RLS + auditoria.** Toda ação sensível (dinheiro, permissão, módulo) grava em `audit_log(actor, role, action, before, after, ip, at)`.
10. **Sem dados no cliente.** Cartão nunca toca nosso servidor — tokenização no cliente (SDK do PSP). PCI-DSS SAQ-A.
11. **LGPD.** Telefone criptografado em repouso, endpoint de exclusão do cliente, contrato de operador. Nunca logar dados pessoais crus.
12. **Máquina de estados de pedido:** `pending_payment → received → preparing → ready → in_transit → completed` + caminhos infelizes (`expired`, `auto_canceled`, `canceled`, `delivery_failed`). Ver `docs/02-definicoes-v1.md` §5.

## Convenções de schema (Postgres)

- **PK = `uuid` v7** (`@default(dbgenerated("uuidv7()"))`, nativo no Postgres 18) em toda tabela. Nunca `bigserial`/serial — ID sequencial expõe ordem e volume de criação (ex.: concorrente conta pedidos por dia olhando o ID).
- **Índice composto em tabela com `tenant_id` sempre começa por `tenant_id`.** `(tenant_id, created_at)`, nunca `(created_at)` sozinho.
- **Soft delete:** toda tabela **mutável** tem `deleted_at` nullable, seja tenant-scoped (`tenants`, `stores`...) ou identidade global (`users`) — exceção é só tabela append-only (`audit_log`, `module_audit`, `notification_log`), que não tem UPDATE/DELETE nenhum, nem soft. Nada se apaga de verdade no MVP; desligar/demitir é reversível e preserva histórico (`user_roles`, `audit_log`). **Toda `UNIQUE` que interage com soft delete vira índice único parcial** (`WHERE deleted_at IS NULL`), nunca constraint composta simples — senão o registro apagado trava o valor pra sempre (ex.: `tenants.slug`, `users.phone_lookup_hash`). Exceção: quando o soft-delete já mora dentro de uma PK composta (`tenant_entitlements`/`tenant_settings` em `(tenant_id, module_key)`), a PK já garante 0-ou-1 linha com ou sem soft delete (Postgres não tem PK parcial) — o índice parcial ali é só **otimização de query** (menor, casa com o `WHERE ... AND deleted_at IS NULL` que o código sempre usa), não protege unicidade que já era garantida.
- **Optimistic locking:** `version int not null default 0` em tabelas mutáveis de negócio (`orders`, `products`, `categories`, `tenant_settings`, `users`...). Update sempre com `WHERE version = :esperado`; 0 linhas afetadas = `ConflictError`. Não precisa em tabelas append-only.
- **Telefone (LGPD):** nunca em claro. Cifra na aplicação (AES-256-GCM, chave em `MOLHO_ENCRYPTION_KEYS`, não pgcrypto) + `phone_lookup_hash` (HMAC determinístico, único) pra busca por OTP. `phone_key_version` na linha permite rotação de chave sem migration em massa (rotaciona no próximo login).
- **RLS:** duas roles do Postgres — `app_migrator` (dono das tabelas, roda migration, único com `CREATE EXTENSION`/DDL) e `app_runtime` (só DML, é quem a API e os workers usam, sujeito a toda policy). `REVOKE ALL ... FROM PUBLIC` explícito no schema `public` — sem isso o Postgres 15+ dá privilégio demais por herança. Toda policy usa a função `app_tenant_visible(tenant_id)`, que lê os GUCs `app.tenant_id`/`app.is_platform` setados por request — sem eles setados, nega por padrão (fail-closed).
- **Migrations do Prisma NÃO devem depender de propriedade do schema.** ACL de nível de **schema** (`REVOKE`/`GRANT ... ON SCHEMA`, criar role, `CREATE EXTENSION`) exige ser dono do schema `public` ou ter `GRANT OPTION` nele — `app_migrator` não é dono, só tem `USAGE`/`CREATE`. Rodar esses comandos dentro de uma migration é aceito pelo Postgres sem erro, mas vira no-op silencioso (checar `pg_namespace.nspacl`/`pg_class.relacl` se desconfiar). Esses comandos vivem em `packages/db/prisma/bootstrap.sql`, executado uma vez por ambiente pelo admin do banco (Neon owner, ou `postgres` local) — nunca dentro de `prisma migrate`. Grant de **tabela** é diferente: `app_migrator` é dono das tabelas (ele as criou), então funciona normal dentro da migration.

## Design system "Tempero"

- Roxo Molho `#820AD1` (primária). No storefront white-label, o lojista escolhe **1 de 4 templates** (Roxo, Brasa `#D93025`, Folha `#0F8A5F`, Grafite `#141216`) — constantes em `packages/ui/themes.ts`, todos AA por construção. NÃO existe seletor de cor livre.
- Inter para tudo. Números tabulares (`tnum`) em PDV, caixa e dashboard.
- Radius 20px em cards, 14px em botões. Espaçamento em escala 4pt.
- Bottom sheets para modais mobile. Timeline vertical com dots animados para status. Skeletons em todo loading.
- Microcopy pt-BR informal, com léxico de restaurante ("comanda", "salão", "no capricho"). Ver §2 do doc de marca.

## Convenções de trabalho

- **Um épico por sessão.** Termine com `pnpm lint && pnpm test && pnpm build` verdes.
- **Testes junto com a feature**, não depois. Cobertura mínima em módulos de negócio (pedido, pagamento, permissão).
- **Contratos primeiro:** schema Prisma e schemas zod em `packages/contracts` antes da UI.
- **CI roda dois perfis:** "somente core" e "tudo ligado". Feature que quebra o perfil mínimo não passa.
- **Commits pequenos, mensagens no imperativo em pt-BR** ("adiciona wizard de impressora", não "added printer wizard").
- **Nunca commite `.env.local`** nem credenciais em código. Se aparecer, revogue no provedor e limpe o histórico.

## Ordem dos épicos

Ver tabela completa em `docs/01-plano-produto.md` §8. Sequência do MVP:

1. Scaffold + design system Tempero
2. Schema Prisma + RLS + registry de módulos + RBAC + seed
3. Auth OTP + sessões + revogação
4. CRUD de cardápio + upload R2 + importação por planilha
5. Storefront: menu, carrinho, bottom sheets
6. Endereços + zonas de entrega + horários
7. Checkout + pedidos + máquina de estados
8. Pagamento PIX estático + reconciliação manual
9. Gestor de pedidos realtime + push/som + fila offline
10. Impressão ESC/POS + agente local + wizard
11. WhatsApp click-to-chat + `notification_log`
12. Página de acompanhamento
13. Onboarding self-service (wizard 7 passos)
13b. 4 templates de tema + logo/capa
13d. Assinatura, trial, dunning
14. Super-admin (provisionamento, módulos, entitlements, impersonation)
— **GO-LIVE do piloto** —
15+. Fases 2–4 (ver plano)

## Segurança

- Rate limit no OTP (por telefone e por IP) — evita SMS pumping.
- Rate limit no storefront público (evita scraping de preço).
- Segredos apenas em variáveis de ambiente. Nunca em código.
- 2FA na Vercel, Neon e Cloudflare — obrigatório.

---

Sempre que uma decisão de arquitetura tiver mais de um caminho razoável, explique-a em uma frase antes de codar, e escolha o mais simples que atende às regras acima.
