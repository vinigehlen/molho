# Benchmark Competitivo — 7 Plataformas Brasileiras de Cardápio Digital / Delivery / PDV

*Documento analítico para o Molho. Escopo: 6 eixos de feature (cadastro de produto, storefront, gestão de pedidos, checkout, delivery, retenção/marketing). Exclui preço/mensalidade e módulo fiscal. Base: sites oficiais e centrais de ajuda públicas — a maioria são landing pages e docs, não o produto navegado por dentro; lacunas estão marcadas explicitamente.*

## TL;DR
- **Vídeo no cadastro de produto NÃO é oferecido por NENHUM dos 7 concorrentes** (nem documentado publicamente): é o diferenciador mais limpo e defensável para o Molho. As 7 plataformas cadastram apenas uma foto principal por produto; galeria/foto secundária do produto tampouco é documentada em nenhuma.
- **CardápioWeb e Cardápiofast são produtos DISTINTOS** (empresas diferentes): CardápioWeb (cardapioweb.com, fundada em 2019, sede em Eusébio/CE, sistema completo com chatbot "Cardapinho"); Cardápiofast (cardapiofast.com, plataforma menor, mensalidade fixa sem taxa por pedido). Não são marcas-irmãs.
- **Table stakes** (todos têm): cardápio via link/QR, complementos com grupos e regras min/máx, PIX, taxa de entrega por bairro e/ou raio, cupom de desconto, notificação de status por WhatsApp. **Diferenciais escassos além de vídeo**: split payment (múltiplas formas no mesmo pedido) e colunas de kanban configuráveis/reordenáveis não são documentados em quase nenhuma.

## Disambiguação crítica: CardápioWeb ≠ Cardápiofast
- **CardápioWeb** (cardapioweb.com): startup fundada em 2019 (sede em Eusébio/CE, região metropolitana de Fortaleza). Sistema completo: cardápio digital, gestão de pedidos, chatbot próprio "Cardapinho", estoque, fidelidade por pontos, disparo em massa, domínio próprio, integração iFood (módulo pago). Central de ajuda em ajuda.cardapioweb.com.
- **Cardápiofast** (cardapiofast.com): plataforma independente, menor, posicionada como "cardápio digital sem taxa por pedido" com mensalidade fixa. Tem board Kanban para cozinha, complementos com radio/checkbox/stepper, taxa por bairro e por km, integração com Meta Pixel/Google Ads/TikTok. É um CONCORRENTE DISTINTO, não marca-irmã do CardápioWeb.
- **Veredito:** são empresas e produtos diferentes que coincidem no nome genérico "cardápio". Nenhuma evidência de relação societária.

---

## 1. BeeFood
Super-app PDV+delivery+fiscal. Central de ajuda: ajuda.beefood.com.br.

### (A) Cadastro / modelagem de produto
- **PODE:** Nome (Título), Descrição, Foto principal ("Adicionar Foto"), Código, Setor (categoria), Valor e valor promocional, grupos de opções/complementos com nome, quantidade mínima e máxima e obrigatoriedade, ativar/desativar por delivery e presencial separadamente, clonar produto, foto em opções/complementos.
- **NÃO PODE / não documentado:** Vídeo no produto (não documentado); múltiplas fotos/galeria do produto (não documentado — campo de foto é singular); variação de tamanho estruturada não aparece explicitamente na doc de cadastro (a confirmar em conta de teste).
- **Oportunidade Molho:** vídeo + galeria por produto; variação de tamanho nativa com preço somando ao total.

### (B) Exposição no cardápio / storefront
- **PODE:** cardápio via link e QR, itens ilimitados com fotos e adicionais, personalização de cores, domínio próprio (documentado), slides/banner na home do cardápio tablet.
- **NÃO/não documentado:** badge de promoção no card (há valor promocional, mas exibição como selo não confirmada); design multipágina para cardápios grandes.
- **Oportunidade:** selo de desconto no card, layout paginado.

### (C) Gestão de pedidos
- **PODE:** tela única de pedidos (delivery/marketplace), lançamento manual (Novo Delivery/retirada), vínculo de entregador ao pedido, aceite automático, atualização de status com aviso automático, KDS (super-app), impressão por setor.
- **NÃO/não documentado:** kanban com colunas configuráveis; edição granular de pedido lançado; split payment.
- **Oportunidade:** split payment e colunas reordenáveis.

### (D) Checkout e pagamento
- **PODE:** PIX, pagamento na entrega (dinheiro/cartão, com instrução personalizada), pagamento online (Mercado Pago cartão), troco (pedido leva troco).
- **NÃO/não documentado:** aplicação de cupom no checkout (a confirmar).

### (E) Delivery
- **PODE:** áreas por mapa, quilometragem, bairro ou CEP; taxa por área; app de entregadores; roteirização inteligente; rastreamento de motoboys (Foody); Entrega Fácil iFood; pedido agendado.
- **NÃO/não documentado:** teto de pedidos por horário no agendamento.

### (F) Retenção e marketing
- **PODE:** programa de fidelidade, cupom de desconto, robô WhatsApp com IA (BeeBot), notificações automáticas de status, avaliações/feedback.
- **NÃO/não documentado:** cashback (não confirmado); disparo em massa (não confirmado).

---

## 2. CardápioWeb
Cardápio + chatbot "Cardapinho", foco em delivery próprio. Central: ajuda.cardapioweb.com.

### (A) Cadastro / modelagem de produto
- **PODE:** Nome (obrigatório) + Preço de venda (obrigatório), Descrição com botão "Melhorar descrição" (IA), Imagem (800x800) com melhoria por IA, Etiquetas, Categoria, Código PDV, preço de custo, promoção (preço promocional + dias da semana), variações de valores ("a partir de"), complementos organizados em Categoria + Grupo de complemento com quantidade mín/máx e obrigatório/opcional, controle de estoque, disponibilidade por dia/horário do produto e da categoria, combos, "mostrar como novidade", produto +18, esconder observação, esconder botões de quantidade, isento de taxa de serviço, venda cruzada (cross-sell).
- **NÃO PODE / não documentado:** Vídeo no produto (não documentado); múltiplas fotos/galeria (não documentado — imagem única).
- **Oportunidade:** vídeo + galeria; este é o cadastro mais rico do grupo, então o Molho precisa igualar a profundidade e superar em mídia.

### (B) Exposição no cardápio / storefront
- **PODE:** cardápio via link/QR sem app nem cadastro; domínio próprio (via DNS); personalização/customização de layout; destaque de produto; novidade.
- **NÃO/não documentado:** tema de cores completo (a confirmar); multipágina.

### (C) Gestão de pedidos
- **PODE:** "Gestão de Pedidos" (PDV) com colunas de categorias/produtos e dados do cliente; lançamento manual por telefone/balcão; edição de pedido lançado (trocar itens, ajustar formas de pagamento); busca de pedido por nome/telefone; layout ajustável; histórico de pedidos; impressão por setor (delivery/retirada/cozinha).
- **NÃO/não documentado:** board kanban visual arrasta-e-solta explícito; split payment; KDS dedicado.

### (D) Checkout e pagamento
- **PODE:** PIX (inclui Pix Automático), cartão pelo cardápio, pagamento online (Mercado Pago, Cielo), pagamento na entrega, cupom no checkout, agendamento.
- **NÃO/não documentado:** troco (provável, a confirmar).

### (E) Delivery
- **PODE:** áreas de entrega, sobreposição de áreas, taxa por bairro e taxa por KM, CEP de exceção, taxa fixa, entregadores, agendamento de pedidos.
- **NÃO/não documentado:** roteirização/rastreamento de motoboy (não confirmado); teto por horário.

### (F) Retenção e marketing
- **PODE:** cupons com regras ricas — validade (a partir de / até), horário, dia da semana, tipo de pedido (delivery/retirada/local), quantidade disponível, valor mínimo, apenas novos clientes (primeira compra), múltiplos usos, restrição por forma de pagamento e por item; programa de fidelidade por pontos (R$1 = X pontos, brinde para novos clientes, resgate em produto ou frete grátis); disparador de mensagens em massa no WhatsApp; chatbot Cardapinho (automação e disparo); sistema de avaliação (QR, chatbot, cardápio).
- **NÃO/não documentado:** cashback nativo (foco é pontos — a confirmar).
- **Oportunidade:** cashback nativo já que a fidelidade é por pontos.

---

## 3. OlaClick
Cardápio SaaS multinacional freemium. 120.000+ negócios em 27 países (autodeclarado), +1,3 milhão de pedidos/mês. Fundada em 2020 em Lima, Peru (Y Combinator W21), com operação em São Paulo. Central: help.olaclick.com.

### (A) Cadastro / modelagem de produto
- **PODE:** categorias, produtos com descrição, preço, foto; "toppings" (complementos) obrigatórios ou não; preços múltiplos (variação); inventário com alerta de estoque e rastreamento (baixa por venda, mas não bloqueia automaticamente — precisa atualizar status manual); descontos por produto.
- **NÃO PODE / não documentado:** Vídeo no produto (não documentado); galeria/foto secundária (não documentado); bloqueio automático por estoque zerado (confirmadamente NÃO — exige atualização manual).
- **Oportunidade:** vídeo, galeria e bloqueio automático de item esgotado.

### (B) Exposição no cardápio / storefront
- **PODE:** personalização com logo, cores e capa; página de boas-vindas com botões (limitado a 4 no Starter, ilimitado em Advanced/Premium); domínio próprio (.com grátis no 1º ano no plano anual); carrossel/banners; funciona offline após download (diferencial).
- **Oportunidade:** o modo offline é um diferencial deles — o Molho pode responder com PWA/cache.

### (C) Gestão de pedidos
- **PODE:** "Pedidos Abertos" (pendentes/em curso), agendados aparecem junto; PDV via "+Novo Pedido"; aceitação manual ou automática; filtrar, buscar, pausar pedidos; KDS integrado; finalizar tudo.
- **NÃO/não documentado:** kanban com colunas configuráveis; edição granular de pedido lançado; split payment.

### (D) Checkout e pagamento
- **PODE:** PIX, cartão, cupom no checkout, pagamento na entrega; pagamento online integrado ao POS/KDS.
- **NÃO/não documentado:** troco (a confirmar).

### (E) Delivery
- **PODE:** entrega com custo fixo, por intervalos ou por zona; pedido agendado (habilita fora do horário); configuração de tipos de serviço (delivery/retirada/local).
- **NÃO/não documentado:** gestão/atribuição de entregadores, roteirização, rastreamento (não documentado — provável lacuna).
- **Oportunidade:** logística de motoboy é fraca no OlaClick.

### (F) Retenção e marketing
- **PODE:** programa de fidelidade; recuperação de clientes inativos com IA via WhatsApp (detecção mensal automática); chatbot WhatsApp (Advanced/Premium, inclui chatbot oficial Meta); notificações push; CRM (dono dos dados).
- **NÃO/não documentado:** cashback nativo; cupom com todas as regras (a confirmar profundidade).

---

## 4. Anota AI
WhatsApp/IA-first, adquirida pelo iFood em 2022 (~R$60 mi, apuração de imprensa). ~70.000 restaurantes cadastrados (Bloomberg Línea); ~40.000 com atendimento automatizado (autodeclarado). Central: anota.ai/ajuda.

### (A) Cadastro / modelagem de produto
- **PODE:** Gerenciador de Cardápio com categoria (Modelo + Nome), item com campos obrigatórios + preço + imagem, grupos de adicionais (opcional/obrigatório, quantidade mín/máx), importar grupo existente, clonar cardápio do iFood, combos, upsell no carrinho, promoções (R$ ou %), edição em massa (esgotar/pausar/excluir), esgotamento automático, carrossel de banners.
- **NÃO PODE / não documentado:** Vídeo no produto (não documentado); múltiplas fotos/galeria — confirmadamente uma imagem por item ("adicionar ou remover imagem do item", singular).
- **Oportunidade:** vídeo e galeria; variação de tamanho estruturada (a confirmar).

### (B) Exposição no cardápio / storefront
- **PODE:** cardápio com cores e mensagens personalizadas, QR Code para mesas, carrossel de banners para promoções, destaque de produtos.
- **NÃO/não documentado:** domínio próprio (não confirmado); multipágina; selo de desconto no card.

### (C) Gestão de pedidos
- **PODE:** board Kanban (tela inicial) com colunas arrasta-e-solta (análise → produção → aguardando retirada); lançamento manual/PDV e balcão; notificações de novos pedidos e observações; filtros para buscar pedidos; impressão automática; KDS (Gestão Avançada); app do garçom com divisão de conta por item; cadastro de colaboradores com rastreio por atendente.
- **NÃO/não documentado:** colunas configuráveis/renomeáveis (as etapas parecem fixas); edição granular pós-lançamento; split payment no mesmo pedido.

### (D) Checkout e pagamento
- **PODE:** PIX (automatizado), cartão de crédito, carteiras digitais (NuPay, Google Pay, Apple Pay), pagamento na entrega, pagamento online (iFood Pago/Tuna) com proteção a chargeback; cupom no cardápio.
- **NÃO/não documentado:** troco (provável via pagamento na entrega, a confirmar).

### (E) Delivery
- **PODE:** regiões por Bairro ou Raio (km em linha reta), taxa por região, cadastro de entregadores (nome, telefone, central, veículo), atribuição de pedido a entregador (via kanban), roteirizador inteligente (Entrega AI) com otimização por proximidade, mapa com localização em tempo real, agendamento de pedidos, Logística Sob Demanda.
- **NÃO/não documentado:** teto por horário no agendamento; taxa por CEP preciso (usa raio em linha reta — limitação conhecida).
- **Oportunidade:** taxa por rota real em vez de raio em linha reta.

### (F) Retenção e marketing
- **PODE:** cupom com regras (tipo, código, descrição, valor mínimo, dias, primeiro pedido apenas, produto vs frete, exclusivo pagamento online, envio a cliente específico, notificar clientes); cashback (% por dia da semana, período de expiração, saldo exibido no cardápio); programa de fidelidade ("compre X ganhe Y", desconto em produto ou frete); recuperador de vendas (carrinho abandonado); robô IA WhatsApp/Instagram/Facebook com áudio; notificações automáticas de status; pesquisa de satisfação.
- **Anota AI é o mais completo em retenção/marketing do grupo.**

---

## 5. Brendi
WhatsApp/IA-first (assistente "Brenda"), delivery próprio, sem PDV/fiscal. ~8.500 restaurantes (autodeclarado). Setup importando do iFood em até 24h. Sede São Paulo.

### (A) Cadastro / modelagem de produto
- **PODE:** importação automática do cardápio do iFood (categorias, produtos, descrições, fotos); organização por categorias com ordem de exibição; cross-sell automático baseado nos últimos 90 dias de vendas; banners promocionais gerados por IA; preço por tamanho e por peso (com peso mínimo); disponibilidade.
- **NÃO PODE / não documentado:** Vídeo no produto (não documentado); galeria/foto secundária (não documentado); regras detalhadas de grupos de adicionais (radio/checkbox/stepper) não documentadas publicamente — provável que herde do iFood (a confirmar); combos não documentados explicitamente.
- **Oportunidade:** cadastro nativo profundo (Brendi depende da importação do iFood); vídeo e galeria.

### (B) Exposição no cardápio / storefront
- **PODE:** link próprio, checkout integrado, banners gerados por IA, stories, destaques, cardápio "bonito e rápido".
- **NÃO/não documentado:** domínio próprio; tema de cores; multipágina.

### (C) Gestão de pedidos
- **PODE:** pedidos no painel + WhatsApp + app de gestão; impressão automática na cozinha; dashboards com alertas em tempo real (feedback negativo gera alerta); relatório de conversão (funil visitantes→compra).
- **NÃO/não documentado:** board kanban; PDV de balcão; edição granular; split payment; KDS dedicado (Brendi não é PDV).
- **Oportunidade:** Brendi é fraca em operação de salão/PDV — não é concorrente direto nesse eixo.

### (D) Checkout e pagamento
- **PODE:** checkout com PIX e cartão, pagamento na entrega, agendamento; cupom/recuperação de carrinho com cupom.
- **NÃO/não documentado:** troco; split payment.

### (E) Delivery
- **PODE:** importa áreas de entrega do iFood; taxas de entrega; relatório de taxa por motoboy.
- **NÃO/não documentado:** roteirização, rastreamento, atribuição a motoboy, gestão de entregadores nativa (não documentado — provável lacuna).

### (F) Retenção e marketing
- **PODE:** IA conversacional "Brenda" (texto, áudio, imagem, figurinha) 24/7; CRM proprietário com segmentação (novatos, promissores, fidelizados, ativos vs perdidos); disparos inteligentes/réguas de CRM; recuperação de carrinho e reativação de inativos; programa de fidelidade com pontos ou cashback; tráfego pago automatizado (diferencial).
- **Brendi + Anota AI lideram em CRM/IA.**
- **Oportunidade:** o tráfego pago automatizado da Brendi é um diferencial que o Molho pode observar.

---

## 6. Yooga
Super-app PDV+delivery+fiscal. ~1,5 milhão de entregas/mês pela base (imprensa), em +1.800 cidades. Sede Vitória/ES. Central: ajuda.yooga.com.br.

### (A) Cadastro / modelagem de produto
- **PODE:** cadastro com nome, preço, descrição, uma foto (800x800, com IA para melhorar/gerar imagem), disponibilidade por dia da semana, copiar produto existente do PDV, categorias de complementos (grupos), foto nos complementos (lançado), capa e descrição do cardápio.
- **NÃO PODE / não documentado:** Vídeo no produto (não documentado); múltiplas fotos/galeria do produto (não documentado — foto única; fotos existem só em complementos); variação de tamanho estruturada e regras min/máx dos grupos (a confirmar em conta de teste).
- **Oportunidade:** vídeo e galeria.

### (B) Exposição no cardápio / storefront
- **PODE:** cardápio via QR Code, link ou totem; personalização com logo/marca; capa; atualização em tempo real; acesso sem app.
- **NÃO/não documentado:** domínio próprio; tema de cores completo; selo de promoção; multipágina.

### (C) Gestão de pedidos
- **PODE:** Gestor de Pedidos integrado (delivery + salão + iFood/Rappi na mesma tela); acompanhamento de status (cozinha→pronto→despacho); PDV com venda em 4 cliques; KDS (plano Premium/PRO); Mapa de Pedidos; despacho a motoboy; atualização automática de status ao cliente.
- **NÃO/não documentado:** kanban com colunas configuráveis; edição granular pós-lançamento; split payment.

### (D) Checkout e pagamento
- **PODE:** PIX integrado (delivery e PDV, com QR na tela), PicPay, cartão de crédito/débito, cartão via POS integrado; pagamento na entrega.
- **NÃO/não documentado:** cupom no checkout (há cupons — a confirmar aplicação no fluxo); troco.

### (E) Delivery
- **PODE:** raio de entrega desenhado no mapa, por bairro ou cidade; taxa por região ou distância; cadastro e seleção de entregador ao despachar; Agrupamento Automático de Rotas (roteirização); Mapa de Pedidos; agendamento com data/hora; Entrega Fácil iFood; acompanhamento em tempo real.
- **NÃO/não documentado:** teto de pedidos por horário; rastreamento GPS do motoboy pelo cliente (a confirmar).

### (F) Retenção e marketing
- **PODE:** programa de fidelidade integrado (PDV + delivery); cupons ilimitados; Robô do WhatsApp (mensagens de status: saudação, aceite, saiu para entrega, entregue); CRM e campanhas ("disparos de ofertas e reativação com um clique"); cashback (Clube Yooga, ligado a Pix/pedidos); pixel Facebook.
- **NÃO/não documentado:** o cashback do "Clube Yooga" beneficia o DONO do restaurante (abate mensalidade); cashback ao consumidor final a confirmar.

---

## 7. SAIPOS
ERP/PDV robusto para food service. +11 mil restaurantes (autodeclarado). Central: meajuda.saipos.com. Sede RS.

### (A) Cadastro / modelagem de produto
- **PODE:** Nome, Preço (só do produto), "pesado em balança ou meia porção", variação de tamanho (com preço dos opcionais editável por variação), vincular a mais de uma categoria, disponibilidade por canal (Delivery / Salão / Pedido Online / Cardápio Digital QR), código interno, uma foto (700x700), local de impressão (cozinha), grupos de opções com quantidade mín/máx (mín 1 = obrigatório), nome/descrição diferentes para o online, disponibilidade por dia/turno, combos e promoções, geração de ingredientes com IA, vínculo ao estoque.
- **NÃO PODE / não documentado:** Vídeo no produto (não documentado); múltiplas fotos/galeria (não documentado — foto única).
- **Oportunidade:** vídeo e galeria; SAIPOS tem o cadastro mais "fiscal/operacional", mas sem mídia rica.

### (B) Exposição no cardápio / storefront
- **PODE:** Site Delivery Saipos e Cardápio Digital QR Code; alterações visuais para combinar com a marca; versões Standard e Premium (visualização vs pedido+pagamento).
- **NÃO/não documentado:** domínio próprio; tema de cores completo; selo de promoção no card; multipágina.

### (C) Gestão de pedidos
- **PODE:** PDV completo, comanda eletrônica, KDS (Monitor KDS dedicado), gestão de mesas, lançamento manual, impressão por setor, Saipos Bot para WhatsApp, controle de motoboys.
- **NÃO/não documentado:** board kanban de delivery com colunas configuráveis; edição granular documentada; split payment.

### (D) Checkout e pagamento
- **PODE:** PIX, pagamento na entrega, pagamento online (Cardápio Premium), formas de pagamento configuráveis; gestão de taxas de pagamento.
- **NÃO/não documentado:** cupom no checkout (a confirmar); troco.

### (E) Delivery
- **PODE:** taxa por bairro (base Correios) e por distância/km; roteirização para motoboys (função dedicada com distância/tempo); app do entregador; controle de motoboys; integrações de logística (+100 integrações).
- **NÃO/não documentado:** teto por horário no agendamento; rastreamento em tempo real pelo cliente (a confirmar).

### (F) Retenção e marketing
- **PODE:** Saipos CRM, cupons, programa de fidelidade (via integrações como Repediu/Meu Cardápio), campanhas semanais automatizadas no cardápio, Saipos Bot; integração com fidelidade/cashback de terceiros.
- **NÃO/não documentado:** cashback nativo (parece depender de integração — a confirmar); disparo em massa nativo vs via integração.
- **Oportunidade:** cashback e disparo nativos (SAIPOS terceiriza parte da retenção).

---

## Seção-Síntese

### (1) Features que a MAIORIA não tem — diferenciadores para o Molho
- **Vídeo no cadastro de produto — NENHUM dos 7 tem (nem documentado).** Diferenciador mais forte e defensável. Vídeo curto do prato (autoplay mudo no card, tela cheia no detalhe) eleva conversão e é barreira técnica baixa para quem já faz upload de imagem.
- **Galeria / múltiplas fotos por produto — não documentada em nenhum.** Combinar com vídeo num "carrossel de mídia do produto".
- **Split payment (várias formas de pagamento no mesmo pedido) — não documentado em nenhum.** Diferencial operacional (ex.: parte no PIX, parte em dinheiro).
- **Colunas de kanban configuráveis/reordenáveis/renomeáveis — não documentado.** Anota AI e Cardápiofast têm kanban, mas com etapas fixas.
- **Taxa de entrega por rota real (não raio em linha reta)** — Anota AI admite usar raio em linha reta; oportunidade de precisão.
- **Bloqueio automático de item esgotado no storefront** — OlaClick confirmadamente exige ação manual; automação é diferencial.
- **Teto de pedidos por faixa de horário no agendamento** — não documentado em nenhum; relevante para pizzarias em pico.

### (2) Table stakes — todos têm (Molho precisa ter no MVP)
- Cardápio via link + QR Code, sem app e sem cadastro do cliente.
- Foto principal + descrição + preço por produto.
- Complementos/adicionais em grupos com quantidade mín/máx e obrigatório/opcional.
- Categorias com ordenação e disponibilidade por dia/horário.
- Controle de disponibilidade/estoque por item.
- PIX + pagamento na entrega (dinheiro/cartão) + pagamento online.
- Taxa de entrega por bairro e/ou raio/km.
- Cupom de desconto com valor mínimo e validade.
- Notificação automática de status por WhatsApp.
- Lançamento manual de pedido (telefone/balcão).
- Pedido agendado (data/hora).
- Robô/chatbot de WhatsApp (nativo nos IA-first; via bot nos PDV-first).

### (3) Lacunas de informação a confirmar navegando o produto real (criar conta de teste)
- **Split payment:** confirmar em TODOS (nenhum documenta) — pode existir sem estar na doc.
- **Edição granular de pedido já lançado** (trocar itens/cliente/endereço/tipo de entrega): confirmado só em CardápioWeb; confirmar nos demais.
- **Kanban — colunas configuráveis/reordenáveis:** confirmar Anota AI, Cardápiofast, Yooga, OlaClick, SAIPOS.
- **Variação de tamanho com preço somando ao total:** confirmado em SAIPOS e CardápioWeb; confirmar BeeFood, Yooga, Anota AI, OlaClick, Brendi.
- **Cashback nativo (ao consumidor final):** confirmado Anota AI; confirmar Yooga (Clube Yooga é para o lojista), OlaClick, CardápioWeb, SAIPOS, BeeFood, Brendi.
- **Domínio próprio:** confirmado BeeFood, CardápioWeb, OlaClick; confirmar Yooga, Anota AI, SAIPOS, Brendi.
- **Rastreamento GPS do pedido pelo cliente:** confirmar em todos.
- **Selo/badge de promoção no card e design multipágina:** confirmar em todos.
- **Troco no checkout:** confirmar em todos (provável na maioria, mas não documentado).

## Recomendações
1. **Cravar o vídeo no produto como feature-âncora** — é o único diferencial confirmado como ausente em 100% dos concorrentes. Implementar como carrossel de mídia (foto principal + fotos secundárias + 1 vídeo curto autoplay mudo). Se qualquer concorrente lançar vídeo no produto, reavaliar prioridade e comunicação de posicionamento.
2. **Igualar o "core" de cadastro do CardápioWeb** (o mais rico do grupo) antes de lançar: variações "a partir de", grupos de adicionais com regras completas, promoção com dias, cross-sell, disponibilidade granular. É o piso competitivo.
3. **Diferenciar na operação:** kanban com colunas configuráveis + split payment + edição livre de pedido lançado. Os três juntos criam um "PDV de delivery" superior aos IA-first (Anota/Brendi) sem competir no robô de IA no dia 1.
4. **Não tentar vencer Anota AI/Brendi no robô de IA de WhatsApp no lançamento** — é o núcleo maduro deles. Entrar com notificações automáticas + chatbot simples (table stakes) e evoluir depois.
5. **Confirmar as lacunas da Seção 3 criando contas de teste** em CardápioWeb, Anota AI e Yooga (os três mais completos e representativos dos arquétipos) antes de fechar o escopo.
6. **Cashback nativo ao consumidor** como retenção de segunda onda — só Anota AI tem claramente; vetor de fidelização com baixa complexidade e ausente na maioria.

## Ressalvas
- A maioria das fontes é landing page de marketing e central de ajuda, não o produto navegado por dentro. Todos os "NÃO/não documentado" significam ausência de documentação pública, não confirmação de que a feature inexiste. Devem ser validados com conta de teste.
- Números de clientes/pedidos são autodeclarados pelas empresas, salvo onde atribuídos à imprensa, e podem estar desatualizados.
- Preço, mensalidade e módulo fiscal foram deliberadamente excluídos do escopo.
- A distinção CardápioWeb vs Cardápiofast foi confirmada por sites e centrais de ajuda distintos, mas não há documento societário público que prove ausência total de relação.

---
*Gerado em 23/08/2026. Base de pesquisa: sites oficiais e centrais de ajuda públicas dos 7 concorrentes.*
