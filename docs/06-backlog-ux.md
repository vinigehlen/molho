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

## Referência

Ver `docs/01-plano-produto.md` §8 (tabela de épicos) — nota apontando pra este arquivo, para não se perder entre sessões.
