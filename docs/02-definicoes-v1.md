# Molho — Definições da v1
**Documento de decisões · Julho/2026 · Fecha as lacunas da auditoria**

## 1. ICP (fechado)
**Restaurante ou lanchonete com delivery próprio já ativo, faturando R$ 40–150 mil/mês, que hoje anota pedido no WhatsApp na mão.**

- **Dor aguda:** erro de pedido, atendente preso no celular no rush, sem histórico de cliente, sem rastreamento.
- **Ganho óbvio:** o pedido chega pronto, impresso, pago.
- **Não exige abandonar o iFood** — reduz a dependência sem exigir ruptura (a objeção nº 1 de venda).
- **Fora do ICP na v1:** restaurante à la carte com salão, dark kitchen 100% marketplace, franquia. (Voltam nas fases seguintes.)

## 2. Escopo do MVP (fechado — 4 a 5 semanas)
**Dentro:** cardápio (categorias, produtos, foto, variações/complementos, esgotado manual) · carrinho · endereço com pin no mapa e zona de entrega (taxa + ETA) · horários da loja · pedido mínimo · **checkout com PIX apenas (estático/manual no go-live; online no épico 24)** · gestor de pedidos em tempo real · impressão de comanda · notificações de status por WhatsApp · página de acompanhamento · onboarding do lojista.

**Fora (fases seguintes):** cupons, fidelidade, promoções, combos, cartão online, KDS, PDV, caixa, app do garçom, app do motoboy, iFood, NFC-e, campanhas, franquias, dashboard avançado.

**Definition of Done do MVP:** um restaurante piloto opera uma sexta-feira inteira sem usar o WhatsApp manual.

---

## 3. Pesquisa de preço — o mercado (julho/2026)

| Concorrente | Planos e valores | Observações |
|---|---|---|
| **Goomer** | <cite index="25-1">Grátis (até 30 pedidos/mês + R$ 1,39 por pedido excedente); Básico R$ 99,90/mês (R$ 59,94 no anual); Automatizar R$ 184,90 (R$ 110,94 anual); Integrar R$ 299,90 (R$ 224,93 anual)</cite> | 4 planos. <cite index="26-1">QR Code é add-on de ~R$ 28/mês</cite>. Descontos agressivos no anual (~40–60%) |
| **Anota AI** (grupo iFood) | <cite index="20-1">Plano mais completo em promoção por R$ 99,99</cite>; planos Start e Gestão Avançada | <cite index="14-1">Mensal, sem taxa por pedido ou comissão; teste grátis de 7 dias</cite>. <cite index="18-1">Preço de tabela pós-promoção é pouco claro, o que gera reclamação de reajuste inesperado</cite> |
| **Cardapio.ai** | <cite index="28-1">A partir de R$ 49,90/mês, teste de 7 dias, sem comissão</cite> | <cite index="17-1">Importa o cardápio do sistema atual e o suporte ajuda a configurar a impressora</cite> |
| **Diggy** | <cite index="18-1">Planos fixos de R$ 99,90 a R$ 189,90</cite> | — |
| **Neemo** | <cite index="30-1">Versão Pro por R$ 289/mês</cite> | — |
| **Mercado (referência)** | <cite index="23-1">Sistema para restaurante: R$ 150–500/mês, podendo passar de R$ 1 mil; PDV para operação pequena/intermediária: R$ 50–300</cite> · <cite index="24-1">Cardápio digital: de R$ 0 a ~R$ 225/mês</cite> | <cite index="23-1">Implementação costuma ter custo único de R$ 400 a R$ 2 mil</cite> |

**Leituras estratégicas:**
1. **A faixa quente é R$ 90–190/mês.** Abaixo de R$ 50 vira commodity; acima de R$ 300 exige PDV+ERP completo (que a v1 não tem).
2. **Todos oferecem 7 dias de trial sem cartão.** É padrão de mercado, não diferencial — mas não tê-lo é desvantagem.
3. **Anual com desconto forte (40%) é como o mercado compra retenção.** Copiar.
4. **Ninguém cobra setup.** <cite index="23-1">Os R$ 400–2.000 de implementação aparecem nos ERPs</cite>, não nos concorrentes diretos. Não cobrar setup é vantagem competitiva barata.
5. **Oportunidade de posicionamento:** <cite index="18-1">a Anota AI é criticada por preço pós-promo pouco claro e reajuste inesperado</cite>, e o iFood comprou Anota AI e Saipos — **"preço transparente, sem letra miúda, e independente do iFood" é uma bandeira que ninguém está segurando.** Combina com o tom da marca Molho.

## 4. Planos do Molho (recomendação)

| | **Standard** | **Pro** ⭐ | **Premium** |
|---|---|---|---|
| **Mensal** | **R$ 99/mês** | **R$ 189/mês** | **R$ 299/mês** |
| **Anual (à vista/12x)** | R$ 69/mês | R$ 129/mês | R$ 209/mês |
| Para quem | Delivery próprio saindo do WhatsApp manual | Quem quer vender mais e organizar a operação | Operação completa (salão + fiscal) |
| Cardápio digital, carrinho, zonas | ✔ | ✔ | ✔ |
| PIX online + pagar na entrega | ✔ | ✔ | ✔ |
| Gestor de pedidos + impressão | ✔ | ✔ | ✔ |
| WhatsApp: notificações de status | ✔ | ✔ | ✔ |
| Pedidos ilimitados | ✔ | ✔ | ✔ |
| Cartão online | — | ✔ | ✔ |
| Robô de atendimento no WhatsApp | — | ✔ | ✔ |
| Cupons, promoções e combos | — | ✔ | ✔ |
| Fidelidade (pontos/cashback) | — | ✔ | ✔ |
| Dashboard avançado | — | ✔ | ✔ |
| App do motoboy + mapa de entregas | — | ✔ | ✔ |
| PDV + caixa | — | — | ✔ |
| KDS | — | — | ✔ |
| Mesas, QR-code e app do garçom | — | — | ✔ |
| Integração iFood | — | — | ✔ |
| Campanhas de marketing | — | — | ✔ |
| Multi-loja | — | — | ✔ |
| **Add-on NFC-e** | R$ 39,90/mês | R$ 39,90/mês | R$ 39,90/mês |

**Política comercial:**
- **Nomes dos planos travados: Standard / Pro / Premium** (decisão D2, 13/07/2026). São as chaves canônicas do registry (`plans: ['standard','pro','premium']`), do billing e da página de preços. A alternativa pt-BR (Balcão/Salão/Casa Cheia) foi descartada — não muda mais.
- **Standard permanece em R$ 99/mês** (decisão D1, 13/07/2026), mesmo com margem bruta de 62% (o suporte come R$ 10,50 dos R$ 34,47 de custo — ver unit economics). A margem abaixo do padrão SaaS é **aceita como custo de aquisição do Pro**: o Standard é a porta de entrada, o upgrade é que faz a margem. Não subimos para R$ 119 nem cortamos o suporte do Standard.
- **Trial de 7 dias, todas as funções, sem cartão** (padrão de mercado).
- **Sem taxa de setup. Sem comissão por venda. Sem fidelidade contratual** — cancela quando quiser. Isso vira o principal argumento contra Anota AI/Goomer.
- **Preço publicado no site, sem "fale com um consultor".** Transparência é posicionamento.
- **Reajuste anual pelo IPCA, avisado com 30 dias** — escrito no contrato. Nunca reajuste-surpresa.
- **Pagamento online do Molho é ganho do lojista** (cai na conta dele) — não cobramos por transação.
- **Pilotos:** 3 primeiros restaurantes recebem Pro grátis por 6 meses em troca de feedback semanal e depoimento.

> **Racional:** o Pro em R$ 189 encosta no Automatizar da Goomer (R$ 184,90) e no topo do Diggy (R$ 189,90) — é a faixa que o mercado já validou. O Standard em R$ 99 bate de frente com o Básico da Goomer (R$ 99,90) e com a promo da Anota AI, mas entregando **PIX online + robô de status**, que ali são de plano superior.

---

## 5. Regras de negócio (padrão do mercado + contrato)

### 5.1 Máquina de estados (feliz e infeliz)
```
pending_payment ──pago──> received ──aceito──> preparing ──> ready ──> in_transit ──> completed
      │ (expira 15min)         │ (não aceito em 10min)        │
      └──> expired             └──> auto_canceled + estorno    └──> delivery_failed ──> returned
```

### 5.2 Cancelamento e estorno (v1)
| Situação | Regra |
|---|---|
| Cliente cancela **antes de a loja aceitar** | Cancelamento livre, **estorno integral automático** do PIX |
| Cliente cancela **após aceito, antes de preparar** | Precisa de aprovação da loja; estorno integral |
| Cliente cancela **com pedido em preparo** | **Não é permitido pelo app.** Só a loja cancela, e decide o estorno (integral, parcial ou nenhum). Registrado com motivo |
| **Loja cancela** (item acabou, não consegue entregar) | Sempre com motivo obrigatório; **estorno integral automático**; cliente notificado no WhatsApp |
| **Pedido pago não aceito em 10 min** | Auto-cancela, estorno integral, cliente e lojista notificados. *Isso protege o cliente do restaurante que esqueceu o painel aberto* |
| **PIX não pago em 15 min** | QR expira, pedido vira `expired`, estoque/reserva liberado |
| **Entrega falhou** (cliente ausente/endereço errado) | Loja marca `delivery_failed` com motivo; **sem estorno automático** (política da loja, declarada no contrato dela) |
| **Item indisponível após o pagamento** | Loja liga para o cliente → substituir, remover item (estorno parcial) ou cancelar (estorno integral) |

**Prazo de estorno PIX:** até 1 dia útil (o PSP devolve pelo Pix Devolução). Comunicado ao cliente na hora do cancelamento.

> **Nota do MVP (PIX estático, antes do épico 24):** enquanto o PSP online não está conectado, o pagamento é PIX estático com confirmação manual — o pedido entra direto como `received` com pagamento "a confirmar", o lojista marca "pago" ao conferir o banco, e **estornos são manuais** (devolução Pix feita pelo lojista). As regras de expiração em 15min e estorno automático passam a valer com o PIX online (épico 24).

### 5.3 Responsabilidades (vai para o contrato)
- **Entrega é 100% do restaurante.** O Molho é software; não contrata, não gerencia e não responde por entregadores. O restaurante é o único responsável pelo vínculo, pagamento e conduta do motoboy.
- **O restaurante é o vendedor** perante o consumidor (CDC). O Molho é ferramenta.
- **O dinheiro é do restaurante** — cai direto na conta dele no PSP. O Molho não custodia valores.
- **Dados:** o restaurante é o **controlador** dos dados dos clientes; o Molho é **operador** (LGPD, art. 5º). Sai num DPA anexo ao contrato.
- **Molho não responde** por: prejuízo de venda por queda de internet do restaurante, erro de cadastro de preço/produto, indisponibilidade de terceiros (PSP, WhatsApp, Google Maps), qualidade do alimento.
- **SLA:** 99,5% de disponibilidade mensal, com crédito proporcional se descumprido.

### 5.4 Estoque
**Manual na v1** (toggle "esgotado"), como Goomer e Anota AI no plano de entrada. Auto-desligamento e contador diário ficam para a v2.

---

## 6. Impressão (decidido)
**Suportar "todas as impressoras" = suportar o padrão ESC/POS**, que cobre praticamente todo o mercado brasileiro (Epson, Elgin, Bematech, Daruma, Tanca, Knup).

**Caminho técnico:**
- **Windows/PC:** agente local do Molho (Electron ou serviço) que expõe a impressora ao navegador → impressão automática, sem diálogo. É o caminho da Cardapio.ai (<cite index="17-1">o suporte ajuda a configurar a impressora</cite>) e da Anota AI.
- **Android (tablet/celular na cozinha):** app do Molho imprimindo via Bluetooth/USB-OTG.
- **Fallback universal:** botão "Imprimir" que abre o cupom formatado em 58/80mm no diálogo do navegador (funciona em qualquer impressora, inclusive laser).

**Onboarding:** wizard de impressora — detecta o SO, oferece o download do agente/driver, imprime um **cupom de teste** e só marca o passo como concluído quando o lojista confirma que saiu o papel. Se precisar de driver do fabricante, o wizard linka direto para a página oficial.

## 7. Modo offline (padrão do mercado)
- **Storefront:** exige internet (o cliente está no celular dele). Sem tratamento especial.
- **Gestor de pedidos (a tela crítica):** cache local dos pedidos abertos + banner vermelho "sem conexão — tentando reconectar". Mudanças de status ficam em fila local e sincronizam ao voltar. **Nunca perde pedido.**
- **Som e reimpressão:** se a rede cair e voltar, os pedidos que chegaram no intervalo tocam o alerta e podem ser reimpressos.
- **PDV (fase 3):** offline-first de verdade (venda local + sync), como fazem os PDVs de mercado. Fora da v1.

## 8. Requisitos não-funcionais (números)
| Requisito | Alvo |
|---|---|
| Disponibilidade | 99,5%/mês (SLA contratual); alvo interno 99,9% |
| **Pedido novo → aparece no gestor** | **< 3 s** (é *o* requisito do produto) |
| Storefront LCP (4G, Android mediano) | < 2,5 s |
| API p95 | < 400 ms |
| Confirmação do PIX (webhook → status) | < 5 s |
| Pico suportado | 50 pedidos/min por loja; 500 lojas simultâneas |
| Backup | Point-in-time recovery, retenção 30 dias |
| Janela de manutenção | Nunca entre 18h e 23h (horário de pico do delivery) |

## 9. Contrato do lojista (estrutura — a redigir com advogado)
1. Objeto (licença de uso de software SaaS, não é serviço de delivery)
2. Planos, preço, reajuste (IPCA, aviso de 30 dias), forma de pagamento
3. Trial de 7 dias e cancelamento sem multa
4. **Responsabilidades do lojista:** veracidade do cardápio e preços, entrega, contratação de entregadores, atendimento ao consumidor, tributos, emissão fiscal
5. **Responsabilidades do Molho:** disponibilidade (SLA 99,5%), suporte, segurança
6. **Limitação de responsabilidade** (§5.3 acima)
7. Política de cancelamento e estorno de pedidos (§5.2) — o lojista adere e ela vira a política pública da loja dele
8. **Anexo LGPD/DPA:** lojista = controlador, Molho = operador; finalidades, subprocessadores (PSP, WhatsApp, AWS, Google), incidentes, retenção, exclusão
9. Propriedade intelectual (dados do lojista são dele; a plataforma é nossa)
10. Suspensão por inadimplência (aviso, 7 dias, depois bloqueio) e exportação dos dados na saída
11. Foro e vigência

---

## 10. Pendências que ficam para o desenvolvimento (aceitas)
Onboarding/importação de cardápio, canal e SLA de suporte, instrumentação de eventos, runbook de incidente, aquisição, Figma, fotos, critérios de aceite — **serão definidos ao longo dos épicos**, conforme sua decisão. Registrado aqui para não se perderem.
