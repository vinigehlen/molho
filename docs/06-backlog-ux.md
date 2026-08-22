# 06 — Backlog de UX (storefront vs. iFood)

Comparação lado a lado do storefront do Molho com o iFood — referência de mercado que o nosso ICP (restaurante com delivery próprio) já usa e conhece no dia a dia, seja como lojista parceiro ou como consumidor. Os itens abaixo foram identificados em `2026-07-21`, olhando a Hamburgueria da Vila (37 produtos, tema Brasa) lado a lado com um restaurante equivalente no app do iFood.

**Não implementar a partir deste documento sem antes trazer pro épico corrente.** Isto é registro para priorização futura, não uma fila de trabalho aprovada.

---

## B1. Densidade dos cards de produto (prioridade alta)

**Hoje:** card vertical com imagem enorme (`MoProductCard` variante `grid`) — ~2 produtos visíveis por tela no desktop.

**iFood:** card horizontal, texto à esquerda + thumbnail ~150×150 à direita — ~6 produtos por tela.

**Por que importa:** a Hamburgueria da Vila tem 37 produtos em 6 categorias. No layout atual o cliente rola quase infinitamente pra ver o cardápio inteiro. Não é uma preferência estética — é função: restaurante com cardápio grande fica difícil de navegar.

**Escopo estimado:** repensar `MoProductCard` em duas variantes — lista densa para desktop, grid compacto para mobile — revisando a proporção da imagem em cada uma. `MoProductCard` já tem uma variante `list` (88px, usada hoje só como base técnica); o trabalho é decidir quando cada variante entra e ajustar densidade/proporções pro caso de uso real de cardápio grande, não só o esqueleto que já existe.

---

## B2. Header rico (padrão iFood)

**Hoje:** header simples — nome da loja + saudação + chips de categoria sticky.

**Alvo:** logo do restaurante, navegação de categorias, busca dentro do cardápio, endereço de entrega ativo com opção de troca, ícone de carrinho com badge de quantidade, banner de cupom quando houver.

**Dependências:**
- Endereço ativo com troca depende do Épico 6 (endereços + zonas de entrega).
- Banner de cupom depende do módulo `coupons` (Fase 2, Épico 15) — módulo hoje registrado como DESLIGADO, fora do MVP.

---

## B3. Carrinho persistente no header

**Hoje:** só a `MoCartBar` flutuante no rodapé, que aparece/some conforme o scroll (ligada ao estado do carrinho, não à posição de scroll — mas fica fora da área visível em telas onde o cliente rolou pra baixo, dependendo do layout).

**Alvo:** ícone de carrinho fixo no header com badge de quantidade, sempre visível, como no iFood. A `MoCartBar` do rodapé continua existindo como CTA de conversão ("Ver carrinho · R$ X"), mas o *acesso* ao carrinho nunca depende de rolar a página até ela.

---

## B4. Layout do sheet de produto em desktop

**Hoje:** `MoProductSheet`/`MoSheet` renderiza vertical (bottom sheet no mobile, painel centralizado no desktop) — mesmo layout vertical em qualquer largura de tela.

**iFood no desktop:** modal horizontal — imagem grande à esquerda, nome/descrição/preço/modificadores/quantidade à direita, tudo visível sem rolar internamente.

**Escopo estimado:** `MoProductSheet` ganha uma variante horizontal a partir de 1024px (`lg:`). `MoSheet` (o primitivo de baixo nível — Esc, foco, scroll lock) não muda; é `MoProductSheet` que decide o arranjo do conteúdo dentro dele.

---

## B5. Modificadores em mais produtos

**Hoje:** só "Monte seu Burger" tem grupos de modificadores (`ModifierGroup`/`Modifier`). Os outros 36 produtos da Hamburgueria da Vila abrem o sheet só com campo de observação livre.

**iFood:** quase todo item tem pelo menos um grupo "Adicional — escolha até N opções" com preço por opção (bacon extra, ovo, ponto da carne, etc.).

**Nota importante:** isto é mais **dado de seed** do que código — o CRUD de catálogo (Épico 4) já suporta modifier groups em qualquer produto, a UI (`MoModifierGroup`, `MoProductSheet`) já renderiza quantos grupos o produto tiver. Quando um lojista real cadastrar o cardápio dele, ele mesmo vai criar esses grupos pela ferramenta de catálogo. Vale, ainda assim, enriquecer o seed da Hamburgueria da Vila com adicionais em alguns produtos (bacon extra, ovo, cheddar extra nos artesanais/smash) pra o piloto ficar mais realista numa demo — sem isso, todo produto fora do Monte seu Burger some como "sem nenhum complemento", o que não é representativo do cardápio real de uma hamburgueria.

---

## Robustez conhecida

Diferente dos itens B1–B5 (UX/comparação de mercado), isto é uma fragilidade técnica já identificada e com causa raiz investigada — registrada aqui por falta de uma seção de robustez mais natural neste projeto ainda.

### R1. P2028 no match de zona sob cold-start do Neon (prioridade: antes do go-live do piloto)

**Sintoma:** `POST /v1/store/:slug/delivery-match` pode devolver 500 (`PrismaClientKnownRequestError: Unable to start a transaction in the given time`, `P2028`) quando o `useEffect` do `TenantMenu` dispara essa chamada no mount — o que acontece quase sempre a poucos milissegundos do `GET /v1/store/:slug` que o Next já fez no SSR da mesma página. As duas rotas abrem transação (`RequireModuleGuard`/`RequestContextService`), cada uma pedindo conexão nova ao pool.

**Por que isto é mais provável em produção do que parece:** o piloto é um restaurante de baixo tráfego. Neon (serverless) hiberna o compute depois de um período ocioso — comum entre o movimento do almoço e o do jantar, ou de madrugada. **O primeiro cliente que abre o cardápio depois de um período parado é exatamente quem bate o cold-start** — não é um caso raro de pico de tráfego, é o caso NORMAL de uma loja pequena.

**Já descartado como causa (Épico 6):**
- Pool de conexão pequeno — `@prisma/adapter-pg` usa o default do `pg.Pool` (10), não foi configurado nada menor.
- Processos `nest start --watch` órfãos competindo pela mesma conexão — o erro persistiu igual depois de matar os 6 órfãos encontrados, sobrando só 1 processo.

**Causa provável:** o compute serverless do Neon demora pra aceitar a conexão FÍSICA nova quando estava hibernado — é o Postgres "acordando", não o Node/Prisma. Duas transações concorrentes batendo nesse momento competem pela mesma janela de timeout.

**Opções a avaliar quando priorizar** (nenhuma decidida ainda):
- **(a) Retry com backoff no `delivery-match` especificamente.** É idempotente e read-only (`ST_Covers`, sem side-effect) — retry é seguro aqui de um jeito que não seria em uma escrita.
- **(b) Warm-up do Neon no SSR antes do `useEffect` disparar** — uma query trivial na própria página que já "acorda" o compute antes do client ter chance de competir por conexão.
- **(c) Mover o match pro server component em vez de `useEffect` do client** — se rodar junto com o resto do payload (mesmo request, mesma transação/conexão), não há duas coisas concorrendo por conexão fria. **Parece a opção mais limpa** (menos uma race condition inteira, não só mais tolerante a ela) — mas precisa de repensar como o `lat`/`lng` (que hoje só existe no client, via `localStorage`/geolocalização) chegaria ao server component a tempo do primeiro render. Não decidido.
- **(d) Connection pooler do Neon**, se ainda não estiver ativo no projeto — reduz a chance de qualquer conexão precisar ser física-nova.

**Prioridade:** antes do go-live do piloto (Épico 14 ou o commit de preparação pra sexta-feira em produção), não antes disso — não bloqueia o Épico 7. Comportamento atual já degrada com segurança (`fetchDeliveryMatch` devolve `null`, o banner "fora da área" simplesmente não aparece nessa janela rara) — é sobre confiabilidade percebida, não sobre dado errado ou tela quebrada.

---

## Features de conversão + redesenho do gestor (handoff 2026-08-22)

Registrado a partir de `docs/handoff-features-conversao-gestor.md`. Numeração `C` pra não colidir com B1–B5 acima (assunto diferente: conversão/gestor, não comparação com iFood).

### C1. Múltiplas fotos por produto — não iniciado
Tabela `product_images` (position, FK composta com tenant_id), migra a foto única existente pra `position=0`, contrato `productResponseSchema.images[]`, CRUD no admin. Fatia A (schema+contrato), gate de review.

### C2. Cupom de desconto v1 — não iniciado
Só percentual/fixo + valor mínimo + validade + limite de usos. Fora do v1: limite por cliente, primeira-compra. Nova coluna `discount_cents` em `orders`, ajusta CHECK `orders_total_equals_sum`. Fatia A, gate de review — toca caminho de dinheiro.

### C3. Agendamento de pedido — não iniciado
`Order.scheduled_for` nullable, config de slot/teto por loja em cima de `store_hours`. Fatia A, gate de review.

### C4. Redesenho dos botões de ação do gestor — não iniciado
Uma ação primária por card (Brasa), utilitárias viram ícone (imprimir) e menu overflow (voltar etapa, cancelar). Fatia B. **Bloqueado:** `apps/backoffice/app/gestor/page.tsx` em edição por outra frente (balcão/analytics) no momento do handoff — aguardando essa janela fechar pra não colidir.

### C5. Colunas configuráveis do kanban — não iniciado
Ordem das colunas de status persistida por loja; não mexe na máquina de estados. Fatia B. Mesmo bloqueio de arquivo que C4.

### C6. Badge de promoção no card do storefront — não iniciado
Depende do dado de desconto existir (C2) — construir a UI antes seria especulativo (sem dado real pra consumir). Fatia B, mas represado atrás de C2.

### C7. Faxina de emoji + regra no CLAUDE.md — em andamento
Regra dura adicionada ao `CLAUDE.md` e `docs/04-brand-design-system.md` §2.4 corrigido (permitia 1 emoji/mensagem, agora zero). Emoji removido de `copy.pt-BR.ts`, `tenant-menu.tsx`, `cart-view.tsx` e testes. **Falta:** `apps/backoffice/app/gestor/page.tsx` (🔔🖨️🛵💬 + ✓), mesmo bloqueio de arquivo de C4/C5.

---

## Referência

Ver `docs/01-plano-produto.md` §8 (tabela de épicos) — nota apontando pra este arquivo, para não se perder entre sessões.
