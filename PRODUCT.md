# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Duas camadas de usuário deste pacote:
- **Direto:** os devs de `apps/storefront`, `apps/backoffice` e `apps/site`, que importam `@molho/ui` (componentes `mo-*`, tokens, temas) em vez de reimplementar UI.
- **Indireto (via as três apps):** dono/gerente de restaurante ou lanchonete no Brasil (backoffice/gestor) e o cliente final fazendo pedido (storefront) — ver Product Purpose abaixo.

## Product Purpose

`@molho/ui` é o design system compartilhado "Tempero" do Molho — plataforma SaaS multi-tenant de cardápio digital, PDV e delivery para restaurantes brasileiros. O pacote fornece componentes React (`mo-button`, `mo-card`, `mo-sheet`, `mo-product-card`, `mo-otp-sheet`, `mo-pix-payment`, etc.), tokens de design (`tokens.css`) e os 4 temas de loja white-label, consumidos pelas três apps do monorepo. Sucesso = qualquer uma das três apps ganha uma UI consistente, acessível (AA) e on-brand sem reinventar componente, e o storefront do lojista consegue trocar de tema sem refactor.

## Positioning

Design nível fintech (Nubank) num mercado de ERP datado — é a camada que garante isso de forma sistemática (tokens + componentes centralizados), não deixado à implementação de cada app.

## Operating Context

Consumido por `apps/storefront` (menu, carrinho, checkout, bottom sheets), `apps/backoffice` (gestor de pedidos realtime) e `apps/site` (landing/marketing institucional). Storybook (`pnpm storybook`) documenta os componentes isoladamente; `test:contrast` roda um portão de contraste real via Playwright/Chromium.

## Capabilities and Constraints

- Vermelho Brasa `#D63A1E` é a cor de identidade institucional; o storefront white-label troca por tenant entre 3 temas fixos (Brasa — padrão, Folha, Grafite) — sem seletor de cor livre.
- Tipografia Inter; números tabulares (`tnum`) em PDV/caixa/dashboard.
- Radius 20px em cards, 14px em botões; espaçamento em escala 4pt; bottom sheets para modais mobile; timeline vertical com dots animados para status; skeletons em todo loading.
- Contraste AA obrigatório por construção, medido no Chromium real (não cálculo estático).
- React 19 peer dependency; `class-variance-authority` + `tailwind-merge` para variantes de componente.

## Brand Commitments

Marca **Molho** — "O ingrediente que transforma." Tom pt-BR informal, "você", léxico de restaurante (comanda, salão, praça, "no capricho"), nunca "usuário"/"plataforma"/"efetuar login". Logo "Pingo no O" (`brand-kit/`) não é substituível. Design system "Tempero" documentado em `docs/04-brand-design-system.md`.

## Evidence on Hand

Produto pré-piloto: sem depoimentos, clientes reais ou métricas de uso ainda. Componentes e tokens em `packages/ui/src` são a fonte real de verdade visual (implementação existente, não conceito).

## Product Principles

- Um componente por conceito de UI — as três apps consomem daqui, nunca duplicam.
- Contraste AA e legibilidade não são negociáveis, mesmo sob pressão de prazo.
- Tema é dado (`themes.ts`), não decisão de CSS ad-hoc por app.
- Tom de cozinha/balcão, nunca de startup de escritório, mesmo em componente utilitário.

## Accessibility & Inclusion

Contraste AA obrigatório, portão medido em Chromium real via Playwright (`test:contrast`). pt-BR como idioma dos textos de UI.
