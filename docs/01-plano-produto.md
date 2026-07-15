# Molho — Plano de Produto: Plataforma de Cardápio Digital, PDV e Delivery
### Análise completa do MisterCheff + Blueprint de desenvolvimento com Claude Code + Design System estilo Nubank

**Autor:** Vinicius · **Data:** Julho/2026 · **Versão:** 2.0 (RC — revisão final pré-desenvolvimento) · **Marca:** Molho

---

## 1. Visão Geral do Produto Analisado

O **MisterCheff** é um SaaS B2B para restaurantes, lanchonetes e deliverys que combina três produtos em um:

1. **Storefront B2C (cardápio digital)** — cada restaurante recebe um subdomínio próprio (`{loja}.plataforma.com.br`) com cardápio, carrinho, checkout, PIX online e rastreamento de pedido.
2. **Backoffice B2B (portal do restaurante)** — PDV fixo e móvel, gestão de cardápio, caixa, dashboard, fidelidade, marketing, mapa de entregas, franquias.
3. **Apps operacionais** — App do Garçom, App do Motoboy, KDS (tela de cozinha) e robô de atendimento no WhatsApp.

**Modelo de negócio:** mensalidade fixa sem taxa sobre vendas (posicionamento anti-marketplace/iFood). Add-ons pagos (ex.: NFC-e por R$ 39,90/mês). Canal de vendas via representantes regionais.

**Proposta de valor central:** "Tenha seu próprio delivery livre de taxas" — o restaurante recupera margem que perderia para marketplaces, automatiza o atendimento via WhatsApp e centraliza pedidos próprios + iFood numa única tela.

---

## 2. Inventário Completo de Funcionalidades (observadas)

### 2.1 Storefront do cliente final (cardápio digital)
| Funcionalidade | Detalhe observado |
|---|---|
| Multi-tenant por subdomínio | `gastrohomedelivery.mistercheff.com.br` — branding, cor-tema (#FF6600 via meta theme-color), logo e dados por loja |
| PWA | Meta tags `apple-mobile-web-app-capable`, instalável, mobile-first |
| Cardápio por categorias | Navegação com âncoras/carrossel de categorias, seção "Os Mais Pedidos" (ranking por vendas) |
| Item do cardápio | Foto, descrição rica, preço fixo ou "A partir de R$" (variações/complementos), estado "Esgotado" (controle de disponibilidade) |
| Combos e "monte seu prato" | Categoria especial (ex.: "Monte seu Farcito") com modificadores |
| Carrinho persistente | Contador de itens + total no rodapé fixo |
| Login por celular | Autenticação por número de telefone + nome (OTP via WhatsApp/SMS), sem senha |
| Endereços | Cadastro com geolocalização ("Usar minha localização"), pin ajustável no mapa, favoritos (casa/trabalho), rua/número/bairro/complemento/referência |
| Área de entrega | Zonas demarcadas no mapa com taxa e tempo por região; validação do endereço contra a zona |
| Status da loja | Aberto/Fechado calculado por tabela de horários (turnos por dia da semana) |
| Info da loja | Pedido mínimo, endereço com link Google Maps, telefone, horários, formas de pagamento (dinheiro, PIX, cartão na maquininha) |
| Pagamento online | PIX com confirmação automática (pedido só entra após pagamento) + cartão de crédito online |
| Cupons | Cupom com validade (data/hora), pedido mínimo e notificação no carrinho |
| Promoções agendadas | Desconto % ou valor por dia da semana e horário |
| Fidelidade | Pontos por compra, histórico de pontos, menu exclusivo de resgate, resgate "pontos + R$", nome customizável do programa |
| Rastreamento | Página `/pedidos` com status: Preparando → Pronto/Aguardando entregador → Em trânsito → Concluído |
| Notificações | Atualizações de status via WhatsApp |

### 2.2 Portal do restaurante (backoffice)
- **PDV fixo:** lançamento de pedidos balcão/mesa/delivery, controle de caixa (abertura/fechamento, sangria, organização por operador e forma de pagamento).
- **PDV móvel:** pagamento na mesa, QR code PIX no celular do operador, funciona com dados móveis (modo offline/degradado).
- **Gestor de pedidos:** tela única centralizando pedidos próprios + iFood (+ aiqfome), mudança de status, despacho.
- **Gestão de cardápio:** cadastro rápido de produtos, categorias, galeria de imagens na nuvem, combos reaproveitando produtos, variações e complementos.
- **Mapa de entregas:** pedidos plotados no mapa com legenda de cores por prioridade/tempo; rastreamento em tempo real dos entregadores; histórico do tempo de entrega por pedido.
- **Dashboard:** 20+ métricas em tempo real por período (vendas, ticket médio, itens mais vendidos, canais etc.).
- **Fidelidade:** configuração de pontos, catálogo de resgate, notificação de saldo via WhatsApp.
- **Recuperador de vendas (CRM/marketing):** disparo de mensagens em massa, campanhas para clientes inativos, campanhas promocionais, relatórios de campanha.
- **NFC-e:** emissão automática a partir do pedido (add-on).
- **Franquias:** portal da franqueadora com cadastro centralizado e gestão de todas as unidades (caso FNP Brasil, 70+ lojas).
- **Autoatendimento QR-Code:** cliente pede da mesa escaneando QR code.

### 2.3 Apps operacionais
- **App do Garçom:** pedidos pela mesa via smartphone, envio instantâneo à cozinha.
- **App do Motoboy:** despacho automático por QR-code, atualização de status integrada ao WhatsApp, geração de rota para Google Maps/Waze, tracking de localização.
- **KDS:** tela de cozinha com fila de pedidos, etapas de produção e tempo por etapa.
- **Robô WhatsApp:** saudação automática, botões interativos, envio do link do cardápio, confirmação de pagamento, notificações de status.

---

## 3. Análise Técnica (engenharia reversa do que é observável)

### 3.1 Stack identificada
| Camada | Evidência | Tecnologia |
|---|---|---|
| Site institucional | `meta-generator: WP Rocket`, Elementor, GTM | WordPress + Elementor + Google Tag Manager |
| Storefront | Subdomínio wildcard, HTML server-rendered com hidratação JS, jQuery-like patterns | App web multi-tenant (provavelmente PHP/Laravel ou similar) servido por tenant |
| CDN / Imagens | `d3im3awbb0qs95.cloudfront.net/eyJidWNrZXQ...` — URL base64 de JSON `{bucket:"misters3", key:"mc_{tenant}_{id}/uploads/item/...", edits:{resize:{width:300,fit:"cover"}}}` | **AWS Serverless Image Handler** (CloudFront + Lambda + Sharp) sobre bucket S3 único com prefixo por tenant |
| Assets estáticos | `d3j04qwgd90tvb.cloudfront.net/home/...` | Segundo CloudFront para assets globais |
| Identidade do tenant | Prefixo `mc_gastrohomedelivery_043304` | Tenant ID = slug + código numérico; isolamento lógico (single database ou schema por prefixo) |
| Autenticação | Fluxo "celular + nome" sem senha | OTP por WhatsApp/SMS, sessão por token |
| Geolocalização | Pin ajustável, "usar minha localização", link para coordenadas | Google Maps JS API + Geocoding + browser Geolocation API |
| Mobile | Meta tags PWA, viewport travado | PWA (não há app nas lojas para o cliente final) |

### 3.2 Decisões de arquitetura que valem copiar
1. **Multi-tenancy por subdomínio com bucket S3 único** e prefixo por tenant — simples de operar e barato.
2. **Serverless Image Handler** — redimensionamento on-the-fly via URL assinada em base64; zero pipeline de imagem no backend.
3. **Autenticação por telefone** — reduz fricção no checkout a quase zero e alimenta o canal WhatsApp (o telefone É a identidade do cliente para o CRM e fidelidade).
4. **WhatsApp como espinha dorsal de notificação** — status de pedido, confirmação de pagamento, pontos de fidelidade e campanhas usam o mesmo canal.
5. **Pedido só confirmado após webhook de pagamento PIX** — elimina conferência manual e fraude de "falso comprovante".
6. **Status machine simples de 4 estados** para delivery — fácil de comunicar ao cliente e ao motoboy.

### 3.3 Pontos fracos observados (oportunidades de superar)
- Storefront pesado (HTML gigante, todas as categorias renderizadas de uma vez; sem lazy loading real de seções).
- UI datada, tema laranja genérico, pouca hierarquia visual — **aqui entra o design Nubank como diferencial**.
- Sem SSR moderno/SEO estruturado (schema.org de menu/restaurante ausente).
- Sem app review/avaliações, sem agendamento de pedidos visível, sem multi-idioma.

---

## 4. Integrações e APIs necessárias

| Domínio | Recomendação principal | Alternativas | Uso |
|---|---|---|---|
| **PIX + cartão online** | Mercado Pago (API Pagamentos + webhook) | Efí (ex-Gerencianet), Asaas, Pagar.me, Stripe BR | QR dinâmico PIX, confirmação via webhook, cartão tokenizado, split para franquias |
| **WhatsApp** | **MVP: click-to-chat (`wa.me`), custo zero** · Fase 2: Meta Cloud API em número dedicado (opcional) | Nunca usar API não-oficial (Baileys/Evolution): risco de ban do número do lojista | Status de pedido (MVP), robô e campanhas (Fase 2) |
| **Mapas e geo** | Google Maps Platform: Maps JS, Geocoding, Places Autocomplete, Distance Matrix | Mapbox (mais barato em escala), OpenStreetMap/Nominatim | Pin de endereço, zonas de entrega (polígonos), rota do motoboy, mapa de despacho |
| **NFC-e** | Focus NFe (API REST, abstrai SEFAZ por UF) | Tecnospeed PlugNotas, Nuvem Fiscal, eNotas | Emissão automática de NFC-e a partir do pedido, contingência, DANFE |
| **iFood** | iFood Developer API (merchant, orders, catalog via polling/webhook) | — | Centralizar pedidos iFood no gestor de pedidos |
| **Impressão térmica** | ESC/POS via QZ Tray (web) ou agente local | Impressão via app Android (Bluetooth) | Comanda de cozinha e cupom não fiscal |
| **Push/notify interno** | WebSocket (Socket.io / Pusher / Ably) + Web Push | Firebase Cloud Messaging para apps | Novo pedido no PDV/KDS em tempo real, tracking do motoboy |
| **SMS fallback** | Twilio / Zenvia | AWS SNS | OTP quando WhatsApp falhar |
| **E-mail transacional** | Resend / AWS SES | Postmark | Recibos, relatórios, onboarding |
| **Storage/imagens** | S3 + CloudFront + Serverless Image Handler | Cloudflare R2 + Images, imgix | Fotos de produtos com resize on-the-fly |
| **Analytics** | PostHog (produto) + GTM/GA4 (marketing) | Mixpanel | Funil de checkout, métricas do dashboard |

### APIs internas a construir (contratos principais)
```
POST /v1/auth/otp/request          {phone}                → envia OTP (WhatsApp→SMS fallback)
POST /v1/auth/otp/verify           {phone, code, name}    → JWT + refresh
GET  /v1/store/:slug               → config pública do tenant (tema, horários, zonas, pagamentos)
GET  /v1/store/:slug/menu          → categorias, itens, variações, complementos, disponibilidade
POST /v1/orders                    {items, address, payment_method, coupon} → order + PIX qr/copia-e-cola
GET  /v1/orders/:id                → status + timeline + tracking do entregador
POST /v1/webhooks/payments/:psp    → confirmação PIX/cartão (idempotente)
POST /v1/webhooks/ifood            → ingestão de pedidos iFood
WS   /realtime                     → canais: merchant.{id}.orders, order.{id}.status, courier.{id}.location
--- backoffice ---
CRUD /v1/admin/products|categories|modifiers|combos|coupons|promotions|zones|tables
POST /v1/admin/cash-sessions       → abertura/fechamento de caixa
GET  /v1/admin/dashboard?from&to   → 20+ métricas agregadas
POST /v1/admin/campaigns           → disparo segmentado (inativos, aniversariantes...)
POST /v1/admin/invoices/:orderId   → emissão NFC-e (proxy Focus NFe)
```

---

## 5. Arquitetura Proposta (nossa versão)

```
                    ┌─────────────────────────────────────────────┐
                    │                CLOUDFRONT / CDN              │
                    └──────┬──────────────┬───────────────┬───────┘
                           │              │               │
              {loja}.app.com.br     admin.app.com.br   img.app.com.br
                           │              │               │
                    ┌──────▼──────┐ ┌─────▼──────┐  ┌─────▼─────────┐
                    │ STOREFRONT  │ │ BACKOFFICE │  │ Image Handler │
                    │ Next.js SSR │ │ Next.js    │  │ Lambda+Sharp  │
                    └──────┬──────┘ └─────┬──────┘  └───────────────┘
                           │              │
                    ┌──────▼──────────────▼──────┐     ┌──────────────┐
                    │        API (NestJS)        │◄───►│ Redis        │
                    │  REST + WebSocket gateway  │     │ cache/filas  │
                    └──┬────────┬────────┬───────┘     └──────────────┘
                       │        │        │
              ┌────────▼──┐ ┌───▼────┐ ┌─▼──────────────────────────┐
              │ PostgreSQL│ │ S3     │ │ Workers (BullMQ)           │
              │ (RLS por  │ │ uploads│ │ whatsapp, pagamentos, nfce,│
              │  tenant)  │ │        │ │ campanhas, ifood-poller    │
              └───────────┘ └────────┘ └─┬──────┬──────┬──────┬─────┘
                                         │      │      │      │
                                     WhatsApp  PSP   Focus  iFood
                                     Cloud API (PIX)  NFe    API
```

**Stack sugerida (otimizada para Claude Code):**
- **Monorepo:** Turborepo + pnpm — `apps/storefront`, `apps/backoffice`, `apps/api`, `apps/kds`, `apps/courier` (PWA), `packages/ui` (design system), `packages/db`, `packages/contracts` (zod/OpenAPI).
- **Frontend:** Next.js 15 (App Router) + TypeScript + Tailwind + shadcn/ui customizado com tokens Nubank.
- **Backend:** NestJS + Prisma + PostgreSQL (Row-Level Security por `tenant_id`) + Redis + BullMQ.
- **Realtime:** Socket.io (gateway no NestJS) ou Ably.
- **Infra:** Vercel (fronts) + Railway/Fly.io ou AWS ECS (API/workers) + RDS + S3 + CloudFront.
- **Apps operacionais:** PWAs (garçom, motoboy, KDS) — evita lojas de app no MVP; React Native/Expo na fase 3 se necessário.

### 5.1 Modelo de dados (núcleo)
```
tenants(id, slug, name, theme_json, cnpj, plan, status)
stores(id, tenant_id, address, geo, min_order, phone, whatsapp_number)
store_hours(store_id, weekday, opens_at, closes_at, shift)
delivery_zones(id, store_id, polygon GEOMETRY, fee, eta_minutes)
categories(id, tenant_id, name, sort, visible)
products(id, tenant_id, category_id, name, description, base_price, image_key, available, sort)
modifier_groups(id, product_id, name, min, max)  / modifiers(id, group_id, name, price_delta)
combos(id, tenant_id, name, price) / combo_items(combo_id, product_id, qty)
customers(id, tenant_id, phone UNIQUE, name, points_balance)
addresses(id, customer_id, label, street, number, district, complement, reference, geo)
orders(id, tenant_id, customer_id, channel[web|pdv|waiter|qrcode|ifood], type[delivery|pickup|dine_in],
       status[received|preparing|ready|in_transit|completed|canceled], table_id, courier_id,
       subtotal, delivery_fee, discount, total, payment_status, coupon_id, timestamps...)
order_items(order_id, product_id, qty, unit_price, notes) / order_item_modifiers(...)
payments(id, order_id, method[pix|card_online|card_machine|cash], psp, psp_ref, status, paid_at)
coupons(id, tenant_id, code, type, value, min_order, starts_at, ends_at, usage_limit)
promotions(id, tenant_id, discount, weekdays[], start_time, end_time, scope)
loyalty_config(tenant_id, program_name, points_name, earn_rate)
loyalty_events(customer_id, order_id, points, type[earn|redeem])
reward_items(tenant_id, product_id, points_cost, cash_component)
cash_sessions(id, store_id, operator_id, opened_at, closed_at, opening_amount, totals_json)
couriers(id, tenant_id, name, phone, status) / courier_locations(courier_id, geo, at)
campaigns(id, tenant_id, segment_json, template, scheduled_at, stats_json)
invoices(id, order_id, nfce_key, status, xml_url, danfe_url)
subscriptions(tenant_id, plan, status[trialing|active|past_due|suspended|canceled], trial_ends_at, current_period_end, psp_customer_ref)
refunds(id, payment_id, amount_cents, reason, status, psp_ref, created_by)
audit_log(id, tenant_id, actor_id, actor_role, action, entity, before_json, after_json, ip, at)
notification_log(id, tenant_id, order_id, channel, template, recipient, status, at)
printer_configs(store_id, connection[agent|bluetooth|browser], model, width[58|80], auto_print)
-- stores ganha: timezone (Brasil tem 4 fusos). TODO valor monetário: INTEIRO em centavos, nunca float.
franchises(id, owner_tenant_id) / franchise_stores(franchise_id, tenant_id)
```

---

## 5-B. Modularidade, Entitlements e Feature Flags

**Princípio:** nenhuma funcionalidade é assumida como "sempre ligada". Toda capability é um **módulo** com um identificador estável, e cada tenant recebe um conjunto de módulos habilitados. O painel de admin da plataforma (super-admin do Molho) liga/desliga módulos ao provisionar um novo domínio; o próprio lojista liga/desliga o que já tem direito, dentro do plano.

### 5-B.1 Três camadas distintas (não confundir)
| Camada | Quem controla | Muda com que frequência | Exemplo |
|---|---|---|---|
| **Entitlement** (direito) | Super-admin / billing | Por contrato, plano ou add-on | Tenant do plano Básico não tem direito a `fiscal.nfce` |
| **Setting** (configuração) | Lojista, no painel dele | Sempre que quiser | Tem direito à fidelidade, mas escolheu deixar desligada |
| **Release flag** (engenharia) | Time do Molho | Durante o desenvolvimento | `orders.scheduled` em beta para 5 lojas |

Uma feature só aparece se: `entitled AND enabled AND released`. A UI **nunca** mostra caminho morto — módulo sem entitlement aparece com selo "Disponível no plano Pro" (upsell) ou some completamente, conforme a política do módulo.

### 5-B.2 Catálogo de módulos (registry)
Cada módulo é declarado em código (`packages/contracts/modules.ts`) — fonte única da verdade para backend, UI e billing.

```ts
export const MODULES = {
  // Core — sempre ligado, não desligável
  'catalog':   { core: true },
  'orders':    { core: true },
  'customers': { core: true },

  // Canais de venda
  'channel.storefront':   { plans: ['standard','pro','premium'], default: true },
  'channel.qrcode_table': { plans: ['premium'], requires: ['tables'] },
  'channel.waiter_app':   { plans: ['premium'], requires: ['tables'] },
  'channel.ifood':        { plans: ['premium'], external: true },
  'channel.whatsapp_bot': { plans: ['pro','premium'], external: true }, // Cloud API opcional (Fase 2)
  'notify.whatsapp_ctc':  { plans: ['standard','pro','premium'], default: true }, // click-to-chat

  // Operação
  'pdv':              { plans: ['premium'] },
  'pdv.mobile':       { plans: ['premium'], requires: ['pdv'] },
  'cash_register':    { plans: ['premium'], requires: ['pdv'] },
  'kds':              { plans: ['premium'] },
  'tables':           { plans: ['premium'] },
  'delivery.zones':   { plans: ['standard','pro','premium'], default: true },
  'delivery.courier_app': { plans: ['pro','premium'] },
  'delivery.live_map':    { plans: ['pro','premium'], requires: ['delivery.courier_app'] },
  'printing.escpos':  { plans: ['standard','pro','premium'], default: true },

  // Pagamentos
  'payments.pix_static':   { plans: ['standard','pro','premium'], default: true }, // MVP
  'payments.pix_online':   { plans: ['standard','pro','premium'], external: true }, // épico 24
  'payments.card_online':  { plans: ['pro','premium'], external: true },
  'payments.on_delivery':  { plans: ['standard','pro','premium'], default: true },

  // Crescimento
  'coupons':     { plans: ['pro','premium'] },
  'promotions':  { plans: ['pro','premium'] },
  'combos':      { plans: ['pro','premium'] },
  'loyalty':     { plans: ['pro','premium'] },
  'reviews':     { plans: ['pro','premium'] },
  'campaigns':   { plans: ['premium'], metered: true },

  // Gestão
  'dashboard.basic':    { plans: ['standard','pro','premium'], default: true },
  'dashboard.advanced': { plans: ['pro','premium'] },
  'fiscal.nfce':        { addon: true, price: 'R$ 39,90/mês', external: true },
  'multi_store':        { plans: ['premium'] },
  'franchise':          { plans: ['premium'], tenantType: 'franchisor' },
} as const;;
```

**Propriedades:** `core` (não desligável) · `plans` (quais planos dão direito) · `addon` (cobrado à parte, independe do plano) · `requires` (dependências — o sistema bloqueia habilitar `cash_register` sem `pdv`) · `external` (exige credencial de terceiro, tem estado de "conectado/pendente") · `metered` (uso cobrado) · `default` (ligado ao provisionar).

### 5-B.3 Modelo de dados
```sql
plans(id, name, price_month, modules JSONB)            -- pacotes comerciais
tenant_entitlements(tenant_id, module_key, source[plan|addon|manual|trial],
                    status[active|trialing|suspended], trial_ends_at, limits JSONB)
tenant_settings(tenant_id, module_key, enabled BOOL, config JSONB)  -- escolha do lojista
feature_flags(key, rollout_pct, tenant_allowlist[], enabled)        -- engenharia
module_audit(tenant_id, module_key, actor_id, action, at)           -- quem ligou o quê e quando
```

`limits JSONB` cobre quotas por plano: `{"products": 100, "stores": 1, "campaign_msgs": 5000}`.

### 5-B.4 Como isso aparece no código
```ts
// Backend — guard no NestJS
@RequireModule('loyalty')
@Post('/loyalty/redeem')  ...

// Serviço central, resolve as 3 camadas + dependências + quotas
const can = await modules.isActive(tenantId, 'delivery.live_map');

// Frontend — um único gate, usado em toda UI
<Gate module="campaigns" fallback={<UpsellCard plan="Max" />}>
  <CampaignBuilder />
</Gate>

// Navegação do backoffice é gerada do registry, não hardcoded:
// menu = MODULES.filter(m => isActive(tenant, m)).map(toNavItem)
```

**Regras não-negociáveis:**
1. **Gate no backend sempre.** Esconder no front é UX; a segurança está no guard da API. Toda rota de módulo tem `@RequireModule`.
2. **Webhooks e workers também checam.** Nada de o worker de campanha disparar mensagem para tenant que perdeu o entitlement.
3. **Desligar é reversível e não-destrutivo.** Desabilitar `loyalty` congela os pontos, não apaga. Dados voltam intactos se religar.
4. **Módulo desligado some da nav, do menu do PDV e das APIs públicas** do storefront (o cardápio nem expõe o campo de cupom se `coupons` está off).
5. **Teste de matriz:** o CI roda a suíte com o perfil "somente core" e com "tudo ligado". Feature nova que quebra o perfil mínimo não passa.

### 5-B.5 Painel de provisionamento (super-admin)
Ao criar um domínio novo, a tela mostra:
1. Dados do tenant (slug/subdomínio, CNPJ, responsável).
2. **Plano** → pré-marca os módulos automaticamente.
3. **Módulos** em grid com toggles, agrupados por família (Canais, Operação, Pagamentos, Crescimento, Gestão). Dependências se auto-marcam; conflitos são bloqueados com explicação.
4. **Add-ons** com preço ao lado (NFC-e, iFood, Campanhas).
5. **Trials:** qualquer módulo pode virar trial com data de expiração (vira `status: trialing`; ao expirar, degrada sozinho e notifica o lojista).
6. **Limites** editáveis por tenant (override de quota do plano).
7. Preview: "Este lojista verá: [lista de menus]".
8. Tudo gravado em `module_audit`.

### 5-B.6 Impacto no roadmap
Isto entra na **Fase 0 (fundação)** — o registry, as tabelas, o `ModuleService`, o `@RequireModule` e o `<Gate>` nascem antes de qualquer feature. Cada épico da seção 8 passa a ter um item obrigatório de Definition of Done: *"a funcionalidade está registrada como módulo, tem gate no backend e no front, e a suíte 'somente core' continua verde"*.

---

## 5-C. Papéis de Usuário, Permissões e Escopo (RBAC)

**Modelo:** RBAC com escopo. Uma pessoa (`user`) recebe **atribuições** (`user_roles`) — cada uma é um par *papel + escopo*. O escopo define **sobre o quê** o papel vale: plataforma, franquia, tenant ou uma loja específica. Isso permite o caso real de "gerente da unidade Moema" e "supervisor de 12 lojas da franquia" sem duplicar contas.

```
user_roles(user_id, role, scope_type[platform|franchise|tenant|store], scope_id)
```

### 5-C.1 Papéis internos (Molho)
| Papel | O que faz | Não pode |
|---|---|---|
| **platform_owner** | Tudo. Gestão de planos, entitlements, billing, flags globais | — |
| **platform_support** | Vê tenants, provisiona domínio, liga/desliga módulos, abre *impersonation* com consentimento e trilha de auditoria | Alterar preços de plano, apagar tenant, ver dados de pagamento crus |
| **platform_finance** | Billing, faturas, inadimplência, suspensão de conta | Acessar operação/pedidos do lojista |
| **platform_engineer** | Release flags, rollout, observabilidade | Acessar dados pessoais de clientes finais em produção sem quebra-vidro |

> **Impersonation** ("entrar como o lojista") é o recurso mais perigoso da plataforma: exige motivo escrito, expira em 30 min, é somente-leitura por padrão, gera evento no `audit_log` e notifica o lojista por e-mail. Ações de escrita durante impersonation ficam marcadas com o ator real.

### 5-C.2 Papéis do lojista (escopo tenant/store)
| Papel | Escopo típico | Permissões-chave |
|---|---|---|
| **owner** | tenant | Tudo do tenant: financeiro, plano/add-ons, cardápio, equipe, relatórios, exclusão de dados. Único que convida `manager` e vê margem/custo |
| **manager** (gerente) | store | Operação completa da loja: cardápio, pedidos, caixa (abre/fecha/sangria), cupons, promoções, entregadores, relatórios da loja. Convida `cashier`/`waiter` |
| **cashier** (operador de caixa/PDV) | store | Lança pedidos, recebe pagamento, abre/fecha **o próprio** caixa, imprime. **Cancelamento e desconto manual exigem aprovação do manager** (PIN/aprovação in-app) |
| **waiter** (garçom) | store | Abre mesa, lança pedido, envia à cozinha, fecha conta. Não vê caixa, faturamento nem cadastro |
| **kitchen** (cozinha/KDS) | store | Vê fila, muda status de preparo. Sem acesso a valores, cliente ou financeiro |
| **courier** (entregador) | store | Vê apenas os pedidos atribuídos a ele: endereço, telefone do cliente (mascarado/proxy), rota. Muda status de entrega. **Nenhum acesso ao backoffice** |
| **accountant** (contador) | tenant | Somente-leitura: relatórios fiscais, NFC-e, exportações. Sem acesso a operação, cardápio ou clientes |
| **marketing** | tenant | Cupons, promoções, fidelidade, campanhas. Vê segmentos agregados; exporta lista só com aprovação do `owner` (trilha LGPD) |

### 5-C.3 Papéis de franquia (escopo franchise)
| Papel | Permissões |
|---|---|
| **franchisor_owner** | Cria unidades, define cardápio-mestre e quais itens a unidade pode alterar, vê consolidado de todas as lojas, define política de preços |
| **franchisor_analyst** | Somente-leitura do consolidado e comparativo entre unidades |

A unidade franqueada continua tendo seu `owner` local, mas com **campos travados** pela franqueadora (`locked_fields` no cardápio-mestre). Regra: a franqueadora nunca vê o caixa individual do franqueado, salvo se o contrato marcar `franchise.financial_visibility = true`.

### 5-C.4 Cliente final
| Papel | Observação |
|---|---|
| **customer** | Não é usuário do backoffice. Identidade = telefone verificado por OTP, **escopo por tenant** (o mesmo telefone em dois restaurantes = dois registros isolados; pontos de fidelidade não cruzam). Acessa: próprios pedidos, endereços, saldo de pontos, exclusão de conta (LGPD) |

### 5-C.5 Matriz de permissões (recorte)
`✔` permitido · `△` requer aprovação · `—` negado

| Ação | owner | manager | cashier | waiter | kitchen | courier | accountant | marketing |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Editar cardápio e preços | ✔ | ✔ | — | — | — | — | — | — |
| Marcar item esgotado | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — |
| Criar pedido (PDV/mesa) | ✔ | ✔ | ✔ | ✔ | — | — | — | — |
| Aplicar desconto manual | ✔ | ✔ | △ | — | — | — | — | — |
| Cancelar pedido pago | ✔ | ✔ | △ | — | — | — | — | — |
| Estornar pagamento | ✔ | △ | — | — | — | — | — | — |
| Abrir/fechar caixa | ✔ | ✔ | ✔¹ | — | — | — | — | — |
| Sangria | ✔ | ✔ | △ | — | — | — | — | — |
| Mudar status de preparo | ✔ | ✔ | ✔ | ✔ | ✔ | — | — | — |
| Despachar entregador | ✔ | ✔ | ✔ | — | — | — | — | — |
| Ver faturamento da loja | ✔ | ✔ | — | — | — | — | ✔ | — |
| Ver margem/custo | ✔ | — | — | — | — | — | — | — |
| Emitir NFC-e | ✔ | ✔ | ✔ | — | — | — | ✔ | — |
| Disparar campanha | ✔ | — | — | — | — | — | — | ✔ |
| Exportar base de clientes | ✔ | — | — | — | — | — | — | △ |
| Gerenciar equipe | ✔ | ✔² | — | — | — | — | — | — |
| Ligar/desligar módulo (com direito) | ✔ | — | — | — | — | — | — | — |
| Contratar add-on / mudar plano | ✔ | — | — | — | — | — | — | — |

¹ apenas o próprio caixa · ² apenas papéis abaixo do seu

### 5-C.6 Regras de implementação
1. **Permissão é granular, papel é atalho.** O código checa `can(user, 'order.refund', {storeId})`, nunca `if (role === 'manager')`. Papéis são conjuntos de permissões no registry (`packages/contracts/permissions.ts`) — assim dá para criar papéis customizados por tenant depois sem refactor.
2. **Duas checagens sempre:** permissão (RBAC) **e** módulo (seção 5-B). `@RequireModule('loyalty') @RequirePermission('loyalty.redeem')`.
3. **RLS no Postgres é a última linha de defesa** — escopo de tenant/store aplicado no banco, não só na aplicação.
4. **Menor privilégio por padrão.** Convite novo entra como papel mais restrito possível; elevação é ação explícita e auditada.
5. **Aprovação in-app (`△`)** = fluxo de PIN do manager na tela do PDV, registrado com ator, motivo e timestamp. Isso é controle de fraude, não burocracia.
6. **Dados pessoais do cliente final:** telefone visível ao `courier` apenas mascarado (ou via chamada-proxy) e só enquanto o pedido está ativo. `kitchen` nunca vê cliente.
7. **Tudo que é `✔` em dinheiro gera `audit_log`** (ator, papel, escopo, antes/depois, IP).
8. **Sessão:** JWT curto com `roles[]` e `scopes[]`; refresh checa revogação (demitir um garçom precisa cortar o acesso na hora — `token_version` por usuário).

---

## 5-D. Pagamentos: Custo, Disponibilidade e Estratégia Multi-PSP

### 5-D.1 A decisão que vem antes da taxa: quem recebe o dinheiro?
Existem dois modelos possíveis, e eles mudam tudo:

| Modelo | Como funciona | Consequência |
|---|---|---|
| **A. Conta do lojista (recomendado)** | Cada tenant conecta a **própria conta** no PSP (OAuth / subconta). O dinheiro do pedido cai direto no restaurante. O Molho cobra só a mensalidade do SaaS. | Molho **não** custodia dinheiro de terceiros → não vira instituição de pagamento perante o BACEN, não herda chargeback, não tem risco de crédito. Cada lojista negocia (ou herda) a própria taxa. |
| **B. Split / marketplace** | O dinheiro passa pela conta-mãe do Molho, que faz o split e repassa. | Permite cobrar comissão por venda e ter float, mas: obrigações regulatórias, risco de chargeback e fraude do lojista, KYC de todos os sellers, conciliação pesada. |

**Recomendação:** modelo **A** como padrão — ele *é* a proposta de valor da marca ("sem taxa por venda"; o dinheiro é do lojista e cai na conta dele). O split fica disponível apenas para o módulo `franchise` (repasse de royalty da unidade para a franqueadora) e como opção futura de monetização.

### 5-D.2 Custos (tarifas de balcão, julho/2026 — sempre negociáveis por volume)
Fontes públicas dos próprios PSPs e comparativos de mercado; **valide na negociação, pois todos abrem exceção acima de ~R$ 20–50 mil/mês.**

| PSP | PIX | Cartão de crédito | Split / subcontas | Observação |
|---|---|---|---|---|
| **Asaas** | <cite index="2-1">30 transações grátis por mês; depois, tarifa de tabela</cite> | <cite index="2-1">R$ 0,49 fixo por cobrança; parcelado/assinatura acrescenta 1,99% sobre o total</cite> | Sim (nativo, feito para plataformas) | **Melhor custo para ticket alto.** Taxa fixa em vez de % no cartão à vista é anomalia excelente para restaurante (ticket R$ 80 → R$ 0,49 vs ~R$ 3,20 em % ). Promo de 3 meses para novas contas. |
| **Pagar.me** (Stone) | Competitivo, negociável | ~2,99%–3,49% negociável | Sim (recebedores, split nativo) | Feito para marketplaces/SaaS. API e docs excelentes. Stone é adquirente própria → menos camadas, melhor margem em escala. <cite index="9-1">Stone pratica 0,75% no PIX, abaixo de Cielo/PagSeguro/Mercado Pago</cite> |
| **Mercado Pago** | <cite index="9-1">0,99% sobre o valor recebido (plano padrão), sem piso fixo; acima de ~R$ 20 mil/mês costuma cair para 0,79–0,89%</cite> | <cite index="9-1">Caro no parcelado longo — a linha de 12x é das mais altas do mercado</cite> | Sim (Marketplace/OAuth) | <cite index="5-1">Maior reconhecimento de marca no checkout brasileiro, o que ajuda conversão em loja desconhecida</cite>. Onboarding do lojista é o mais fácil do Brasil. |
| **Iugu** | Baixo | <cite index="7-1">~2,49% no plano padrão, com condições melhores por volume</cite> | Sim | Bom custo, mas <cite index="7-1">marca menos conhecida e painel menos intuitivo</cite> |
| **Efí (Gerencianet)** | Muito baixo / plano com franquia | ~2,99%+ | Parcial | Historicamente o PIX mais barato para volume; API PIX madura |
| **Stripe** | Suporte a PIX, mas periférico | <cite index="5-1">A partir de 3,99% + R$ 0,39</cite> | Sim (Connect) | <cite index="5-1">Documentação exemplar, mas menos integrações locais e curva maior</cite>. Não vale a pena para operação 100% BR. |

**Leitura para o nosso caso (restaurante, ticket médio R$ 60–90, PIX dominante):**
1. **PIX é o campo de batalha real.** <cite index="5-1">No e-commerce brasileiro o PIX já responde por 30–40% das transações e em segmentos populares supera o cartão; para o lojista significa recebimento instantâneo, taxa próxima de zero e zero chargeback</cite>. Em delivery, a proporção é ainda maior. Otimizar PIX > otimizar cartão.
2. **Cartão com taxa FIXA (Asaas) bate taxa percentual** em ticket acima de ~R$ 20. Num pedido de R$ 90: R$ 0,49 vs ~R$ 2,70 (3%). É a maior economia disponível na mesa.
3. **Cuidado com a economia burra:** <cite index="5-1">gateway barato que recusa transação legítima ou demora a liberar o dinheiro custa mais caro que o equilibrado</cite>. Taxa de aprovação e prazo de repasse (D+0 no PIX, D+1 vs D+30 no cartão) entram na conta.

### 5-D.3 Recomendação
- **PSP primário: Asaas** — melhor custo total para o perfil (PIX com franquia + cartão em taxa fixa), split e subcontas nativos, feito para plataformas.
- **PSP secundário (failover e escolha do lojista): Mercado Pago** — onboarding trivial, marca que converte, e serve de rota alternativa quando o primário cai.
- **PSP para escala/franquias: Pagar.me/Stone** — quando o GMV justificar negociação direta com adquirente.
- O lojista **escolhe** o PSP no painel (é conta dele). O Molho recomenda o padrão e mantém os três suportados.

### 5-D.4 Disponibilidade (o requisito mais importante depois do custo)
Pagamento fora do ar = restaurante parado em horário de pico. Arquitetura:

1. **Abstração `PaymentProvider`** (porta) com implementações por PSP (adaptadores). Nenhuma regra de negócio conhece "Mercado Pago".
2. **Roteamento com failover:** cada tenant tem PSP primário e, opcionalmente, secundário. *Health check* contínuo (latência + taxa de erro). Se o primário degradar, novas cobranças vão para o secundário automaticamente; as pendentes continuam sendo conciliadas no original.
3. **Idempotência ponta a ponta:** `Idempotency-Key` por tentativa de cobrança; webhooks tratados com deduplicação por `psp_ref` (o mesmo evento chega 2–5 vezes, é normal).
4. **Reconciliação ativa (não confiar só em webhook):** worker faz *polling* de status de cobranças pendentes (backoff 5s → 30s → 2min). Webhook perdido não pode virar pedido perdido.
5. **Circuit breaker + fila persistente:** se o PSP cai, a cobrança entra em fila e o cliente vê "confirmando pagamento…" em vez de erro. Nada se perde.
6. **Degradação graciosa:** PSP totalmente fora → o storefront oferece **PIX estático (chave do lojista) com confirmação manual** e "pagar na entrega". A loja **nunca** para de vender.
7. **Observabilidade:** dashboard com taxa de aprovação, latência p95 e tempo até confirmação do PIX por PSP. Alerta se aprovação cair > 5 p.p. da média.
8. **PCI:** cartão **nunca** toca nosso servidor — tokenização no cliente (SDK do PSP). Isso nos mantém em PCI-DSS SAQ-A, o escopo mais barato.

### 5-D.5 Onde isso entra no roadmap (integração no fim, conforme decidido)
Durante todo o desenvolvimento, o sistema roda com o **`MockPaymentProvider`** (gera QR PIX falso, simula webhook, permite testar todos os fluxos e a máquina de estados). A integração real vira os **últimos épicos**, já com o produto inteiro pronto:

| # | Épico | Entregável |
|---|---|---|
| ~~8~~ | *(revisado)* Pagamentos com **MockPaymentProvider** | Máquina de estados, idempotência, reconciliação e telas de PIX/cartão completas — tudo testável sem PSP real |
| **24** | Adaptador **Asaas** (sandbox → produção) | PIX dinâmico com webhook, cartão tokenizado, onboarding/subconta do lojista via API |
| **25** | Adaptador **Mercado Pago** + **roteamento com failover** | Segundo PSP ativo, health check, troca automática, painel de escolha do PSP pelo lojista |
| **26** | Conciliação, antifraude e hardening | Polling de reconciliação, relatório de divergências, regras antifraude para "pagar na entrega", PCI SAQ-A, testes de caos |
| **27** | NFC-e + franquias (inclui split de royalty) | Repasse automático via recebedores |

> **Timing dos épicos 24–26:** "ao fim" = ao fim do MVP, não do produto inteiro. Assim que o piloto validar a operação (pós-épico 14) e o KYC do Asaas sair, os épicos 24–26 rodam **em paralelo à Fase 2** — o piloto não deve passar mais que 2–3 semanas em PIX estático manual.

> **Risco assumido (transparente):** deixar a integração real para o fim é seguro do ponto de vista de arquitetura — o adaptador é plugável — **mas o gargalo não é técnico, é burocrático.** Onboarding, KYC e homologação de PSP levam de 2 a 6 semanas. **Abra as contas sandbox e inicie o credenciamento agora, na Fase 0**, mesmo sem escrever a integração; assim os épicos 24–26 não ficam bloqueados esperando papel.

---

## 6. Design System — estilo Nubank

Princípios do design Nubank a aplicar: **roxo como identidade, tipografia grande e amigável, cards com cantos bem arredondados, muito espaço em branco, ícones outline, microinterações suaves, tom de voz humano e direto.**

### 6.1 Tokens
```css
:root {
  /* Cores */
  --brand-900:#4B0082; --brand-700:#6200A3; --brand-500:#820AD1; /* primária */
  --brand-300:#B565F3; --brand-100:#EFE1FB; --brand-050:#F8F1FE;
  --ink-900:#111111; --ink-600:#585666; --ink-400:#8E8B9A;
  --bg:#FFFFFF; --surface:#F5F5F7; --line:#E9E7EE;
  --success:#12A454; --warning:#F5A623; --danger:#E4404E; --pix:#32BCAD;
  /* Nota: por ser white-label, --brand-* é sobrescrito por tenant; roxo é o default da plataforma */

  /* Tipografia (alternativas abertas à Graphik, fonte do Nubank) */
  --font-sans:"Inter","Plus Jakarta Sans",system-ui;
  --fs-display:2rem/1.15; --fs-title:1.375rem/1.25; --fs-body:1rem/1.5; --fs-caption:.8125rem/1.4;

  /* Forma e profundidade */
  --radius-card:20px; --radius-btn:14px; --radius-pill:999px;
  --shadow-card:0 4px 20px rgba(17,17,17,.06);
  --space-unit:4px; /* escala 4-8-12-16-24-32-48 */

  /* Movimento */
  --ease:cubic-bezier(.2,.8,.2,1); --dur:180ms;
}
```

### 6.2 Padrões de componente
- **Home do cardápio:** header roxo com saudação ("Oi, {nome} 👋"), busca em pill branca, chips de categoria horizontais, cards de produto com foto 1:1 arredondada, preço em destaque, botão "+" circular roxo.
- **Botão primário:** roxo sólido, texto branco semibold, altura 52px, radius 14px, estado pressed escurece 8%.
- **Bottom sheet** para detalhes do produto e modificadores (padrão Nubank de camadas), com stepper de quantidade grande.
- **Carrinho:** barra fixa inferior estilo "pill" roxa com contador + total, expandindo em sheet.
- **Status do pedido:** timeline vertical com dots animados (como o acompanhamento de cartão do Nubank), cor por etapa.
- **PIX:** tela dedicada com QR central, botão "copiar código" gigante, countdown de expiração, cor de apoio --pix.
- **Backoffice:** sidebar escura roxo-profundo, cards de métrica com números grandes, gráficos minimalistas (sem grid pesado), skeleton loading em tudo.
- **Vazios e erros:** ilustrações simples + microcopy amigável ("Nada por aqui ainda. Que tal criar seu primeiro produto?").
- **Acessibilidade:** contraste AA no roxo (usar --brand-700 para texto), alvos de toque ≥44px, dark mode na fase 2.

---

## 7. Roadmap de Produto (revisado — MVP real)

> ICP: restaurante com delivery próprio ativo, R$ 40–150 mil/mês, hoje anotando pedido no WhatsApp na mão. Ver `definicoes-v1.md`.

### Fase 0 — Fundação (Semana 1)
Monorepo, CI, design system Tempero (tokens + componentes), Postgres com RLS, **registry de módulos + gates**, **RBAC com escopo**, auth OTP, upload S3, seed do tenant demo.
**Saída:** apps sobem, login funciona, `pnpm test` verde nos perfis "core" e "tudo ligado".

### Fase 1 — MVP (Semanas 2–6)
Cardápio (categorias, produtos, fotos, variações, esgotado manual) · **importação por planilha** · storefront (menu, carrinho, bottom sheets) · endereço com pin e **zonas de entrega** · horários e pedido mínimo · **checkout PIX (MockPaymentProvider)** · gestor de pedidos realtime · **push/som para o lojista** · **impressão ESC/POS + wizard de impressora** · **WhatsApp de status (click-to-chat)** · página de acompanhamento · **onboarding self-service + assinatura/trial**.
**Saída:** o restaurante piloto opera uma sexta-feira inteira sem WhatsApp manual.

### Fase 2 — Vender mais (Semanas 7–12)
Cupons · promoções agendadas · combos · fidelidade · dashboard · avaliações · robô WhatsApp (Cloud API, número dedicado, opcional) · app do motoboy + mapa de entregas · cartão online.
→ habilita o plano **Pro**.

### Fase 3 — Operação completa (Semanas 13–20)
PDV + caixa · KDS · mesas, QR-code e app do garçom · integração iFood · campanhas de marketing · multi-loja.
→ habilita o plano **Premium**.

### Fase 4 — Escala
NFC-e (add-on) · franquias · pedidos agendados · IA (descrições, previsão de demanda) · app nativo.

### KPIs
Ativação: 1º pedido real em < 48h do cadastro · conversão do storefront > 8% · retenção M3 > 85% · pedido novo visível no gestor < 3s · uptime 99,5%.

---

## 8. Épicos para o Claude Code

**Regras:** um épico por sessão · termina com testes verdes e commit · Definition of Done de todo épico = *módulo registrado no registry + gate no backend (`@RequireModule` + `@RequirePermission`) + gate no front + suíte "somente core" verde*.

| # | Épico | Fase | Entregável |
|---|---|---|---|
| 1 | Scaffold do monorepo + design system Tempero | 0 | Storybook com componentes Mo*; 3 apps sobem |
| 2 | Schema Prisma + RLS + **registry de módulos** + **RBAC** + seed — ✅ **entregue** | 0 | Migrations, `ModuleService`, `can()`, tenant demo (Hamburgueria da Vila + Pizzaria Roma) |
| 3 | Auth OTP (mock de envio) + sessões + revogação | 0 | Login por telefone nos dois fronts |
| 4 | CRUD de cardápio + upload S3 + **importação por planilha** | 1 | Lojista sobe 80 produtos de um CSV |
| 5 | Storefront: menu, carrinho, bottom sheets | 1 | Navegação mobile completa |
| 6 | Endereços + zonas de entrega (polígonos) + horários | 1 | Fora da zona bloqueia; loja fechada desabilita checkout |
| 7 | Checkout + pedidos + **máquina de estados completa** (feliz + infeliz) | 1 | Cancelamento, expiração, auto-cancel em 10min, estorno |
| 8 | Pagamento PIX com **MockPaymentProvider** | 1 | QR, webhook simulado, idempotência, reconciliação |
| 9 | Gestor de pedidos realtime + **push/som** + fila offline | 1 | Pedido aparece em <3s; não perde pedido se a rede cair |
| 10 | **Impressão ESC/POS** + agente local + wizard de impressora | 1 | Cupom de teste sai no papel no onboarding |
| 11 | **WhatsApp de status via click-to-chat** + `notification_log` | 1 | Um toque envia o status pelo número do próprio lojista |
| 12 | Página de acompanhamento do pedido (timeline) | 1 | Cliente vê status em tempo real |
| 13 | **Onboarding self-service + wizard de 7 passos** | 1 | Signup OTP → loja publicada em <30min, sem humano do Molho |
| 13b | **Tema: 4 templates** (Roxo, Brasa, Folha, Grafite) + logo/capa | 1 | Lojista escolhe 1 dos 4; toda loja fica bonita e AA |
| 13d | **Assinatura e billing** (trial, planos, dunning, suspensão) | 1 | Cobrança recorrente + cancelamento em 2 cliques |
| 14 | Super-admin: provisionamento, módulos, entitlements, impersonation | 1 | Painel interno completo |
| — | **🚀 GO-LIVE do piloto** | — | Sexta-feira inteira em produção |
| 15 | Cupons + promoções + combos | 2 | — |
| 16 | Fidelidade + avaliações | 2 | — |
| 17 | Dashboard + relatórios | 2 | — |
| 18 | App do motoboy (PWA) + mapa de entregas | 2 | — |
| 19 | Robô WhatsApp (Cloud API, número dedicado, opcional) | 2 | — |
| 20 | PDV + caixa | 3 | — |
| 21 | KDS + mesas + QR-code + app do garçom | 3 | — |
| 22 | Integração iFood | 3 | — |
| 23 | Campanhas de marketing + multi-loja | 3 | — |
| 24 | **Adaptador Asaas** (PIX + cartão, sandbox → produção) | — | Substitui o mock |
| 25 | **Adaptador Mercado Pago + roteamento com failover** | — | Segundo PSP, health check |
| 26 | Conciliação, antifraude, PCI SAQ-A, testes de caos | — | Hardening final |
| 27 | NFC-e (Focus NFe) + franquias | 4 | — |

> **Nota:** os épicos 24–26 (PSP real) são os últimos, conforme decidido — mas **abra as contas sandbox e o KYC agora**: o gargalo é burocrático (2–6 semanas), não técnico.

---

## 9. Prompt para o Claude Code

Cole o prompt abaixo na primeira sessão. Ele cria o projeto e o `CLAUDE.md` que guiará todas as sessões seguintes (use os épicos da tabela acima como mensagens subsequentes: "Agora implemente o Épico N").

```markdown
Você vai construir comigo o "Molho" — uma plataforma SaaS multi-tenant de cardápio
digital, PDV e delivery para restaurantes brasileiros, inspirada funcionalmente no
MisterCheff, mas com design no estilo Nubank e stack moderna.

## Contexto de produto
IMPORTANTE: leia docs/definicoes-v1.md — ele fecha ICP, escopo do MVP, planos/preços,
regras de cancelamento/estorno, impressão, offline e requisitos não-funcionais.
O MVP (4-5 semanas) é APENAS: cardápio → carrinho → endereço com zona de entrega →
checkout com PIX (mock/estático até o épico 24) → gestor de pedidos em tempo real → impressão
de comanda → notificações de status no WhatsApp → onboarding do lojista.
FORA do MVP: cupons, fidelidade, promoções, combos, cartão online, KDS, PDV, caixa,
app do garçom, app do motoboy, iFood, NFC-e, campanhas, franquias. Eles existem no
registry de módulos (desligados), mas NÃO são implementados agora.
Planos: Standard R$99, Pro R$189, Premium R$299 (mensal); trial 7 dias sem cartão.

SELF-SERVICE 100% (ver docs/self-setup.md): o lojista cadastra, configura, personaliza,
escolhe domínio e publica SOZINHO. Nenhum passo depende de humano do Molho.
- Wizard de 7 passos com autosave, preview ao vivo e checklist persistente.
- Domínio: SEMPRE E APENAS {slug}.molho.app. Sem domínio próprio, sem CNAME, sem TLS
  on-demand. Wildcard TLS *.molho.app. SEO por loja: OG com a capa, JSON-LD
  Restaurant/Menu, favicon e PWA manifest.
- Tema: o lojista escolhe 1 de 4 TEMPLATES prontos (Roxo #820AD1 padrão, Brasa #D93025,
  Folha #0F8A5F, Grafite #141216+âmbar) — constantes em packages/ui/themes.ts, todos AA
  por construção. Ele também envia logo, capa e descrição. NÃO existe seletor de cor
  livre. Tipografia, raios, espaçamento e cores funcionais não são customizáveis.
  O logo do Molho não é substituído (rodapé "feito com Molho").
- Billing self-service: trial 7 dias → cobrança recorrente → grace 3 dias → suspensão;
  dunning, upgrade/downgrade com pró-rata, cancelamento em 2 cliques, exportação CSV.

WHATSAPP NO MVP = CLICK-TO-CHAT. O sistema NUNCA envia mensagem sozinho: monta o texto
do status e abre https://wa.me/{fone}?text={msg} para o lojista tocar em enviar, pelo
número normal dele. NÃO usar Cloud API nem API não-oficial (Baileys/Evolution) no MVP.
- Multi-tenant por subdomínio: {slug}.molho.app (storefront white-label) e
  admin.molho.app (backoffice do lojista).
- Cliente final: navega cardápio por categorias, monta itens com variações e
  complementos, aplica cupom, cadastra endereço com pin no mapa validado contra
  zonas de entrega (polígonos com taxa e ETA), paga com PIX online (pedido só
  confirma após webhook), cartão ou na entrega, acompanha status em timeline
  (Recebido → Preparando → Pronto → Em trânsito → Concluído) e recebe
  notificações por WhatsApp. Login sem senha: telefone + OTP via WhatsApp.
- Lojista: gestão de cardápio (categorias, produtos, fotos, modificadores,
  combos, disponibilidade), gestor de pedidos em tempo real, PDV com caixa,
  KDS, dashboard com métricas, cupons, promoções agendadas, fidelidade por
  pontos, mapa de entregas com tracking de motoboys, campanhas de WhatsApp,
  NFC-e (Focus NFe), integração iFood, módulo de franquias.

## Stack (obrigatória)
- Monorepo Turborepo + pnpm. No MVP existem 3 apps: apps/storefront, apps/backoffice
  (PWAs Next.js 15 App Router + TS + Tailwind + shadcn/ui) e apps/api (NestJS + Prisma + PostgreSQL com Row-Level Security por tenant_id,
  Redis + BullMQ para filas, Socket.io para realtime),
  packages/ui (design system), packages/db, packages/contracts (zod).
- Integrações via adapters com interface + implementação mock primeiro:
  PaymentProvider (MockPaymentProvider durante TODO o desenvolvimento; adaptadores
  reais Asaas + Mercado Pago só nos épicos 24-26 (logo após o go-live), com failover
  entre PSPs — ver seção 5-D), MessagingProvider (WhatsApp Cloud API),
  FiscalProvider (Focus NFe), MarketplaceProvider (iFood), MapsProvider (Google).
- Testes: Vitest (unit), Playwright (e2e do fluxo de pedido). Toda feature nova
  vem com testes.

## Design system "Tempero" — estilo Nubank (fonte da verdade: molho-brand-design-system.md, incluir no repo em docs/)
- Primária roxo #820AD1 (tons 050–900), superfícies claras #F5F5F7, texto #111.
- Font Inter; títulos grandes e amigáveis; radius 20px em cards e 14px em botões;
  sombras suaves; espaçamento generoso (escala de 4px); ícones lucide outline.
- Padrões: bottom sheets para detalhes de produto; barra de carrinho fixa em pill;
  timeline de status com dots animados; tela PIX com QR central e botão gigante
  "copiar código"; skeletons em todo loading; microcopy humano em pt-BR
  ("Oi, {nome} 👋", "Nada por aqui ainda…").
- White-label: --brand-* sobrescrevível por tenant via theme_json; roxo é o default.
- Acessibilidade AA; alvos de toque ≥44px; mobile-first no storefront.

## Modelo de dados (núcleo — expandir conforme necessário)
tenants, stores, store_hours, delivery_zones (polygon), categories, products,
modifier_groups/modifiers, combos, customers (phone único por tenant), addresses,
orders (channel, type, status, totals), order_items(+modifiers), payments,
coupons, promotions, loyalty_config/loyalty_events/reward_items, cash_sessions,
couriers/courier_locations, campaigns, invoices, franchises, subscriptions, refunds,
audit_log, notification_log, printer_configs. stores tem timezone. TODO valor
monetário é INTEIRO em centavos (nunca float).

## Modularidade (obrigatório desde a fundação)
Toda funcionalidade é um MÓDULO com chave estável, declarado em
packages/contracts/modules.ts (ver seção 5-B do plano). Três camadas:
entitlement (direito, por plano/add-on, controlado pelo super-admin),
setting (o lojista liga/desliga o que tem direito) e release flag (rollout
de engenharia). Uma feature só roda se entitled AND enabled AND released.
- Backend: decorator @RequireModule('chave') em toda rota de módulo; workers
  e webhooks também checam. Esconder só no front é proibido.
- Frontend: componente <Gate module="chave" fallback={<Upsell/>}>; a navegação
  do backoffice é GERADA do registry, nunca hardcoded.
- Dependências (`requires`) e quotas por plano (`limits`) resolvidas no
  ModuleService central.
- Desligar módulo é não-destrutivo (congela dados, não apaga).
- CI roda a suíte em dois perfis: "somente core" e "tudo ligado".
- Painel de super-admin para provisionar domínio: plano → toggles de módulo
  agrupados por família, add-ons com preço, trials com expiração automática,
  limites por tenant, auditoria de quem ligou o quê.
Definition of Done de TODO épico: módulo registrado + gate no back e no front
+ perfil "somente core" verde.

## Papéis e permissões (obrigatório desde a fundação)
RBAC com escopo: user_roles(user_id, role, scope_type[platform|franchise|tenant|store],
scope_id). Papéis: platform_owner/support/finance/engineer (internos);
owner, manager, cashier, waiter, kitchen, courier, accountant, marketing (lojista);
franchisor_owner, franchisor_analyst (franquia); customer (cliente final, identidade
= telefone com OTP, escopo por tenant). Ver matriz completa na seção 5-C do plano.
- O código checa PERMISSÃO granular, nunca o papel: can(user,'order.refund',{storeId}).
  Papéis são conjuntos de permissões em packages/contracts/permissions.ts.
- Duas checagens sempre: @RequireModule('x') + @RequirePermission('y').
- RLS no Postgres como última linha de defesa (escopo tenant/store no banco).
- Ações sensíveis (desconto manual, cancelar pedido pago, sangria) exigem aprovação
  por PIN do manager, registrada em audit_log com ator, motivo e timestamp.
- Impersonation de suporte: motivo escrito, expira em 30min, read-only por padrão,
  audita e notifica o lojista.
- Entregador vê telefone do cliente mascarado e só com pedido ativo; cozinha nunca
  vê dados do cliente.
- JWT curto com roles[]/scopes[] + token_version para revogação imediata.

## Regras de negócio críticas
1. NO MVP (até o épico 24) o pagamento é PIX ESTÁTICO (chave do lojista) com
   confirmação MANUAL: o pedido entra como "received" com payment_status
   'aguardando_confirmacao' e o lojista marca "pago" ao conferir o app do banco;
   estorno é manual (Pix devolução pelo lojista). A partir do épico 24 (PSP online):
   pedido nasce "pending_payment" e só vai para "received" após webhook idempotente
   (guardar psp_ref, tolerar retries); auto-cancel e estorno automáticos passam a valer.
2. Endereço fora de qualquer polígono de zona = checkout bloqueado com mensagem clara.
3. Loja fechada (fora de store_hours) = cardápio navegável, checkout desabilitado.
4. Cupom valida: janela de datas, pedido mínimo, limite de uso; promoções agendadas
   aplicam por weekday+hora; descontos nunca ficam negativos.
5. Pontos de fidelidade creditados apenas em pedidos "completed"; resgate pode
   combinar pontos + dinheiro.
6. Toda query passa por RLS: nenhum dado cruza tenants. Testar isso explicitamente.
7. LGPD: telefone é dado pessoal — criptografar em repouso, endpoint de exclusão.

## Nesta primeira sessão, faça:
1. Scaffold completo do monorepo com os apps e packages acima, ESLint/Prettier,
   docker-compose (Postgres + Redis), CI básico (lint + test + build).
2. packages/ui com os tokens do design system e componentes: Button, Card, Input,
   Sheet, Chip, Stepper, Badge, Timeline, Skeleton, EmptyState — com Storybook.
3. Schema Prisma inicial + migrations + seed de um tenant demo "gastrodemo" com
   ~15 categorias e ~60 produtos de restaurante brasileiro (filés, ala minutas,
   risotos, massas, pratos kids, bebidas), com preços em BRL e alguns "esgotados".
4. Crie o arquivo CLAUDE.md na raiz documentando: stack, convenções de código,
   comandos, estrutura de pastas, regras de negócio acima e o roadmap de épicos
   (2 a 20) para as próximas sessões.
5. Ao final: rode lint, testes e `pnpm dev`, e me mostre um resumo do que existe
   e o que vem no Épico 2 (Auth OTP).

Trabalhe incrementalmente, explique decisões de arquitetura relevantes e nunca
avance para o épico seguinte sem os testes do atual passando.
```

---

## 10. Riscos e pontos de atenção

| Risco | Mitigação |
|---|---|
| WhatsApp não-oficial (Baileys) pode ser banido | Usar Cloud API oficial desde o início; templates aprovados para campanhas |
| Homologação fiscal NFC-e varia por UF | Terceirizar via Focus NFe; começar por RS/SP; add-on opcional como o concorrente |
| Realtime do gestor de pedidos é missão crítica | Fallback de polling + fila persistente; alarme se WebSocket cair |
| Fraude em "pagar na entrega" | Limitar valor por cliente novo; score simples por histórico |
| LGPD (telefones, geolocalização) | Criptografia em repouso, retenção definida, DPO/registro de consentimento no opt-in de campanhas |
| iFood API tem processo de homologação | Iniciar credenciamento na Fase 2 para liberar na Fase 3 |
| Custo do Google Maps em escala | Cache de geocoding; avaliar Mapbox a partir de 50 lojas |

---

*Documento gerado a partir da análise pública de mistercheff.com.br e do tenant gastrohomedelivery.mistercheff.com.br em 12/07/2026.*
