# Molho — Auditoria de Produto: o que ainda falta definir
**Análise crítica pré-desenvolvimento · Julho/2026**

## Veredito em uma frase
Temos uma **arquitetura excelente e um escopo perigoso**. A engenharia está mais madura que o produto: sabemos *como* construir, mas ainda não decidimos *para quem*, *o que exatamente entra na v1* e *como isso vira dinheiro*. Do jeito que está, o risco não é falhar tecnicamente — é construir 24 épicos impecáveis e descobrir no fim que o restaurante não troca o sistema atual por eles.

---

## 🔴 BLOQUEADORES — resolver ANTES da primeira linha de código

### 1. Não existe um ICP (cliente ideal). É o buraco mais grave.
O plano atende simultaneamente: hamburgueria de bairro com 1 pessoa no caixa, restaurante à la carte com salão e garçons, dark kitchen só de delivery, e franquia com 70 unidades. **Esses quatro têm produtos diferentes.** A hamburgueria não quer mesa nem garçom; a franquia não liga para fidelidade, quer consolidação; a dark kitchen vive de iFood, que é justamente o que dizemos combater.

Escolher um ICP muda o MVP inteiro: PDV e mesas entram ou saem, o robô de WhatsApp vira essencial ou supérfluo.

**Decisão necessária:** um ICP para a v1. *Minha recomendação:* restaurante/lanchonete **com delivery próprio já ativo, faturando R$ 40–150 mil/mês, hoje anotando pedido no WhatsApp na mão** — a dor é aguda, o ganho é óbvio e não exige que ele abandone o iFood.

### 2. O MVP está definido como "tudo". Isso não é MVP, é v1 de 6 meses.
A Fase 1 tem cardápio + carrinho + endereços + zonas + cupons + checkout + 3 formas de pagamento + WhatsApp + gestor de pedidos + impressão + rastreamento. São ~8 semanas otimistas para uma equipe que ainda não existe (ver item 4).

**Decisão necessária:** cortar até doer. *Sugestão de MVP real (4–5 semanas):* cardápio → carrinho → endereço com zona → checkout com **PIX apenas** → gestor de pedidos → WhatsApp de status. **Fora do MVP:** cupons, fidelidade, promoções, combos, cartão online, KDS, PDV.

### 3. Não há modelo de preço definido.
Dizemos "mensalidade fixa sem taxa por venda", mas não sabemos: quanto? quantos planos? o que entra em cada um? tem trial? tem setup fee? A seção 5-B lista planos `basico/pro/max` — **eles nunca foram precificados**. Sem isso, o módulo de entitlements não tem o que refletir, e o vendedor não tem o que vender.

**Decisão necessária:** preço dos 3 planos + o que cada um contém + política de trial. Precisa de pesquisa: quanto o MisterCheff, Anota AI, Goomer e Saipos cobram hoje.

### 4. Não sabemos quem constrói, em quanto tempo, com que orçamento.
O roadmap tem 24 épicos e fala em "semanas" — sem dizer de quantas pessoas. Você é PM, não uma equipe. Isso muda tudo: com Claude Code + 1 dev sênior o ritmo é X; com 4 devs é outro.

**Decisão necessária:** tamanho do time, budget mensal (infra + PSP + WhatsApp + Maps já custam dinheiro no dia 1) e se isso é side project ou empresa.

### 5. Não há restaurante piloto nomeado.
O plano cita "1º restaurante piloto vendendo ponta a ponta" como critério de saída — mas ninguém foi convidado. Construir 8 semanas sem um lojista real olhando é a receita clássica de produto errado.

**Decisão necessária:** 1 a 3 restaurantes comprometidos **antes** do código, com acordo de testar em produção e dar feedback semanal.

---

## 🟡 CRÍTICOS — travam a v1 se não decididos até a semana 3

### 6. Regras de negócio que a máquina de estados não cobre
O plano tem 5 status felizes. A realidade do delivery é feia e **não foi modelada**:
- Cliente cancela depois que a cozinha começou. Quem paga? Estorno total, parcial ou nenhum?
- Item acabou depois do pedido pago. Substitui, cancela item, reembolsa?
- Entrega falhou (cliente não atende, endereço errado). Vira o quê?
- Pedido pago mas a loja nunca aceitou (estava fechada, esqueceu). Timeout? Auto-cancela em quantos minutos? Estorno automático?
- Chargeback no cartão.

**Sem isso, o desenvolvedor inventa — e o lojista descobre no pior dia possível.**

### 7. Quem entrega? O modelo logístico não existe.
Assumimos "App do Motoboy", mas: o restaurante tem motoboy próprio? Usa terceirizado (Loggi, Lalamove, Uber Direct)? Como o entregador é pago? Como é atribuído ao pedido — manual, automático, o motoboy pega da fila? **Isso é um produto inteiro escondido dentro de um bullet.**

### 8. Sem inventário/estoque, "esgotado" é manual
O plano só tem um toggle `available`. Na prática, o item acaba no meio do rush e ninguém desmarca — o cliente pede o que não existe. Precisa de: contador simples de disponibilidade diária? auto-desligar? ou aceitamos manual na v1 (decisão válida, mas precisa ser **decisão**)?

### 9. Hardware não foi decidido
Impressão térmica está no plano como se fosse trivial. Não é: qual impressora (Epson, Elgin, Bematech)? USB, rede ou Bluetooth? Web (QZ Tray, exige instalar agente no PC do lojista) ou app Android? **Se o cupom não imprime, o restaurante não usa o sistema.** Idem: o lojista tem tablet, PC ou só celular na cozinha?

### 10. Modo offline não foi tratado
Internet de restaurante cai. O gestor de pedidos e o PDV precisam de comportamento definido para queda de rede (fila local? read-only? bloqueia?). No PDV isso é bloqueante — não dá pra parar de vender porque o Wi-Fi oscilou.

### 11. Requisitos não-funcionais ausentes
Nenhum número: qual o SLA? Uptime alvo? Quanto tempo até o pedido novo aparecer na tela (isso é *o* requisito do produto)? Performance budget do storefront (LCP < 2,5s em 4G num Android popular)? Quantos pedidos simultâneos no pico de sexta?

### 12. Jurídico e LGPD: zero artefatos
Faltam: Termos de Uso da plataforma, Política de Privacidade, contrato SaaS, DPA (somos operador dos dados dos clientes do restaurante — o lojista é o controlador; isso **precisa** estar escrito), política de retenção, base legal do opt-in de campanhas de WhatsApp. Além de: qual CNPJ vai operar? A marca "Molho" foi buscada no INPI e o domínio registrado?

---

## 🟢 IMPORTANTES — não travam a v1, mas precisam de dono

| # | Lacuna | Por quê importa |
|---|---|---|
| 13 | **Onboarding e migração** | Como o lojista sai do sistema atual? Alguém digita 200 produtos? Importação por CSV/planilha? Fotos de quem? **Esse é o maior atrito de venda de SaaS de restaurante** e não está no plano. |
| 14 | **Suporte** | Quem atende às 21h de sexta quando o pedido não imprime? Canal, horário, SLA de resposta, base de conhecimento. |
| 15 | **Instrumentação de métricas** | Os KPIs foram listados, mas nenhum evento foi definido. Sem `menu_viewed`, `add_to_cart`, `checkout_started`, `order_placed` desde o dia 1, o funil é cego. |
| 16 | **Runbook de incidente** | O que fazer quando o PSP cai no sábado? Quem é acionado? |
| 17 | **Aquisição** | O MisterCheff usa representantes regionais. Nós? Vendas diretas, inbound, parceria com contadores? Sem canal, o produto não encontra o cliente. |
| 18 | **Design real (Figma)** | Temos tokens e specs em texto — não temos telas desenhadas. Ou desenhamos, ou aceitamos que o Claude Code vai improvisar layout dentro dos tokens (aceitável, mas é uma escolha). |
| 19 | **Conteúdo do cardápio** | Foto de comida é o principal driver de conversão. Quem fotografa? Aceitamos foto de celular do lojista? |
| 20 | **Aceitação e QA** | Nenhum critério de aceite escrito por funcionalidade. "Pronto" precisa de definição. |

---

## As 8 perguntas que preciso que você responda para destravar tudo

1. **Qual é o ICP da v1?** (Um só.)
2. **Qual o MVP mínimo que um lojista pagaria?** (Corte a Fase 1 até doer.)
3. **Quanto custa o Molho por mês, em quantos planos?**
4. **Quem constrói, em quanto tempo, com que orçamento?**
5. **Qual restaurante piloto vai usar isso em produção?** (Nome e telefone.)
6. **Motoboy próprio, terceirizado ou os dois?**
7. **Como o pedido imprime?** (Hardware e caminho.)
8. **Cancelamento/estorno: qual a política?**

---

## O que fazer nesta semana (ordem sugerida)
1. Ligar para 5 donos de restaurante e perguntar o que usam hoje, o que odeiam e quanto pagam. **1 dia. Isso responde as perguntas 1, 2, 3 e 5 de uma vez.**
2. Registrar `molho.app`/`molho.com.br` e busca no INPI. **1 hora, e destrava a marca.**
3. Abrir contas sandbox: Asaas, Meta WhatsApp Cloud API, Google Maps. **O KYC leva semanas; começa agora e corre em paralelo com o código.**
4. Escrever a política de cancelamento/estorno e a máquina de estados completa (feliz + infeliz). **Meio dia, evita retrabalho pesado.**
5. Só então: rodar a Sessão 1 no Claude Code.

---

## O que já está bem resolvido (para não parecer que só há problema)
✅ Arquitetura multi-tenant, RLS, modularidade por feature flag, RBAC com escopo, estratégia multi-PSP com failover, design system e identidade de marca. Isso é mais fundação sólida do que 90% das startups têm no dia 1 — o problema é que **fundação não é produto**. Falta o pedaço humano: para quem, por quanto, com quem, e o que cortar.
