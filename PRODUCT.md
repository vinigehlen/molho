# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

delegated: static self-contained HTML per landing option (published as Artifacts for comparison; no app framework needed for this marketing exploration)

## Users

Dono/gerente de restaurante, lanchonete ou delivery próprio no Brasil, faturando R$ 40–150 mil/mês, que hoje anota pedido no WhatsApp na mão. Sofre com erro de pedido, atendente preso no celular no rush, zero histórico de cliente, zero rastreamento. Já opera delivery próprio (não é quem está começando do zero) e não quer abandonar o iFood, só depender menos dele.

## Product Purpose

Molho é uma plataforma SaaS multi-tenant de cardápio digital, PDV e delivery para restaurantes brasileiros: storefront do cliente final, gestor de pedidos em tempo real, PIX, impressão de comanda, WhatsApp de status, tudo self-service. Sucesso = o restaurante piloto opera uma sexta-feira inteira de pico sem usar WhatsApp manual.

## Positioning

"Tenha seu próprio delivery livre de taxas." Mensalidade fixa, **zero comissão por venda** — o dinheiro cai direto na conta do restaurante (modelo conta-do-lojista, nunca custódia do Molho). Preço publicado, sem "fale com um consultor", sem reajuste-surpresa (IPCA, 30 dias de aviso). Concorrentes (Anota AI/iFood, Goomer) escondem preço pós-promo ou cobram por pedido; Molho não. Design nível fintech (Nubank) num mercado de ERP datado.

## Operating Context

O lojista roda o negócio no capricho da cozinha, não do escritório: comanda, praça, salão, despacho, "fechou o caixa". Hoje o fluxo é 100% WhatsApp manual — cliente manda mensagem, atendente escreve pedido à mão, sem fila visível, sem impressão automática. Molho substitui isso por cardápio digital + gestor de pedidos com som/push + impressão ESC/POS + notificação de status via WhatsApp click-to-chat (nunca bot automático no MVP).

## Capabilities and Constraints

MVP dentro do escopo: cardápio digital, carrinho, zonas de entrega, checkout PIX (estático/manual no piloto), gestor de pedidos realtime, impressão ESC/POS, WhatsApp click-to-chat de status, página de acompanhamento, onboarding self-service, 4 temas de loja, assinatura/trial.
Fora do MVP (não prometer na landing): cupons, fidelidade, promoções, combos, cartão online, KDS, PDV, caixa, app do garçom, app do motoboy, iFood integrado, NFC-e, campanhas, franquias.
Planos (nomes travados, não traduzir): **Standard R$ 99/mês · Pro R$ 189/mês · Premium R$ 299/mês**, anual com desconto, trial 7 dias sem cartão, sem taxa de setup, sem comissão por venda, sem fidelidade contratual.

## Brand Commitments

Marca **Molho** — "O ingrediente que transforma." Arquétipo Cara Comum + Mago: próximo, de cozinha, direto, bem-humorado sem ser piadista. Tom pt-BR informal, "você", léxico de restaurante (comanda, salão, praça, "no capricho"), nunca "usuário"/"plataforma"/"efetuar login". Logo "Pingo no O" (símbolo + wordmark, `brand-kit/`) não é substituível. Vermelho Brasa `#D63A1E` é a cor de identidade da plataforma (marketing institucional sempre Brasa — só o storefront white-label troca por tenant). Tipografia Inter. Design system "Tempero": radius 20px cards / 14px botões, bottom sheets, timeline com dots, contraste AA obrigatório.

## Evidence on Hand

Sem depoimentos, clientes ou números de uso reais ainda (produto pré-piloto, 3 primeiros restaurantes ainda não fechados). Nenhuma prova social real disponível — landing não pode inventar cliente, avaliação ou métrica de uso. Preços e planos (acima) são reais e podem ser citados. Comparação de mercado (docs/02) é real e pode embasar copy ("sem taxa por pedido", "preço sem letra miúda") sem citar concorrente pelo nome como claim de marketing.

## Product Principles

- Preço é honestidade, não estratégia de conversão: mostrar os 3 planos sem exigir contato de vendas.
- A landing vende alívio de um caos específico (WhatsApp manual no rush), não feature genérica de "sistema de delivery".
- Zero taxa por venda é o argumento central — reforçar sempre que fizer sentido, nunca diluir em lista de features.
- Tom de cozinha/balcão, nunca de startup de escritório.
- Nenhuma prova social fabricada; onde faltar evidência real, a seção é honesta sobre ser um produto novo (ou é omitida).

## Accessibility & Inclusion

Contraste AA obrigatório (herdado do design system Tempero, portão medido em Chromium). pt-BR como idioma único da landing.
