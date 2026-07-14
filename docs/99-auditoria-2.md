# Molho — Auditoria 2ª rodada
**Revisão completa da documentação após as definições da v1 · Julho/2026**

## Veredito
O produto está **90% definido**. Os buracos de estratégia foram fechados. O que resta são **três coisas que travam de verdade** e um punhado de furos de modelo. A boa notícia: nenhum exige mais um mês de planejamento — são decisões de meia hora cada.

A má notícia está no item 2. Leia esse primeiro.

---

## 🔴 1. A documentação está se contradizendo (corrigir hoje)
A seção 7 do plano (Roadmap) e a seção 8 (épicos do Claude Code) **ainda descrevem o escopo antigo** — Fase 1 com cupons, fidelidade, cartão, KDS e PDV em 8 semanas. Isso conflita frontalmente com o MVP de 4–5 semanas que acabamos de fechar.

Se o Claude Code ler o documento como está, ele vai construir o escopo errado. **A fonte da verdade precisa ser única.** (Corrigido abaixo, na seção "Ações".)

---

## 🔴 2. O problema do número de WhatsApp — o maior risco escondido do projeto
Esta é a pegadinha que derruba plataformas de delivery, e nossa doc passa por ela em uma linha.

**O fato:** quando um número de telefone é conectado à **WhatsApp Cloud API oficial da Meta**, ele **deixa de funcionar no aplicativo WhatsApp normal**. O restaurante perde o WhatsApp do celular dele — aquele mesmo onde ele conversa com o cliente, recebe áudio, manda foto do prato.

Isso cria um dilema desconfortável:

| Opção | Consequência |
|---|---|
| **A. Cloud API no número do restaurante** | Ele perde o WhatsApp de sempre. Para o nosso ICP — *"restaurante que hoje anota pedido no WhatsApp na mão"* — isso é **inaceitável**. É literalmente tirar dele a ferramenta que ele mais usa. |
| **B. Cloud API num número novo do restaurante** | Ele precisa comprar um chip novo, e os clientes continuam mandando mensagem no número antigo. O robô fica num número que ninguém conhece. |
| **C. Número do Molho (um só, para todos)** | Escala mal, viola a experiência de marca do lojista e a Meta não gosta. |
| **D. API não-oficial (Baileys/Evolution)** | Funciona no número dele sem tirar o WhatsApp — **é o que a maior parte dos concorrentes brasileiros faz na prática** — mas viola os termos da Meta e o número pode ser banido. Banir o WhatsApp do restaurante = perder o cliente e virar processo. |

**Isso precisa ser decidido antes do épico de WhatsApp**, e muda o produto. Minha recomendação:

> **MVP: não usar Cloud API para o robô. Usar "WhatsApp click-to-chat" para o status.**
> O sistema **não envia** a mensagem — ele **abre o WhatsApp do lojista com a mensagem pronta** (link `wa.me` com texto pré-preenchido), e ele toca em "enviar". Zero risco, zero custo, zero verificação da Meta, e o número dele continua intacto. É um clique, e resolve 90% do valor.
>
> **Fase 2:** oferecer a Cloud API como opção **para quem quiser um número dedicado ao robô** (aí sim, verificação de negócio, templates aprovados). O lojista escolhe.

Se optarmos pela Cloud API já no MVP, precisamos contabilizar: verificação de negócio da Meta (1–3 semanas), aprovação de templates, e **custo por conversa** (item 3).

---

## 🔴 3. Não existe modelo de custo unitário — não sabemos se R$ 99 dá lucro
Definimos preço sem nunca somar o custo. Estimativa grosseira **por lojista/mês** (loja com ~600 pedidos/mês):

| Item | Custo estimado |
|---|---|
| WhatsApp Cloud API (se usado) | Conversas de serviço/utilidade são cobradas por mensagem/conversa — pode chegar a **dezenas de reais**/mês numa loja ativa |
| Google Maps (geocoding + mapa) | Cache agressivo → baixo, mas **sem cache pode explodir** |
| Infra (share de Postgres, Redis, Vercel, S3) | R$ 5–20 |
| Suporte (o custo real) | Se cada loja liga 2×/mês, o custo humano supera tudo |

**Ação:** montar uma planilha de unit economics antes de publicar preço. Se o WhatsApp oficial custar R$ 40/mês por loja, o Standard de R$ 99 tem margem apertada — e isso reforça a recomendação do item 2 (click-to-chat = custo zero).

---

## 🟡 4. Faltam sistemas que a v1 precisa e ninguém escreveu

### 4.1 Onboarding self-service e billing do SaaS (não existe no plano)
Prometemos **trial de 7 dias sem cartão** e preço publicado. Isso implica:
- Cadastro self-service (o lojista cria o tenant sozinho — hoje só existe provisionamento manual pelo super-admin)
- Wizard de setup (dados da loja → cardápio → zonas → horários → impressora → publicar)
- **Cobrança recorrente da mensalidade do Molho** (cartão recorrente/PIX assinatura) — **isso é uma segunda integração de pagamento, diferente da do lojista**, e não está em lugar nenhum
- Estados da assinatura: trial → ativo → inadimplente → suspenso → cancelado
- Dunning (aviso de falha de cobrança, retry, bloqueio)

**Sem isso, não há como cobrar ninguém.** É um épico inteiro que sumiu.

### 4.2 Importação de cardápio
Cadastrar 80 produtos na mão é o maior atrito de ativação. <cite index="17-1">A Cardapio.ai importa o cardápio do sistema atual</cite> e a Anota AI copia direto do iFood. Sem isso, o piloto trava no dia 1. Mínimo viável: **importação por planilha (CSV/XLSX)** + colar link do iFood na v2.

### 4.3 Notificação do lojista quando o painel está fechado
O gestor de pedidos é uma tela web. Se o dono fecha a aba, ele **não vê o pedido**. Precisa de: som persistente, **push notification (Web Push / PWA instalado)** e escalonamento (não aceitou em 5 min → notifica de novo). Isso é o que ativa a regra de auto-cancelamento em 10 min — e está pressuposto, mas não especificado.

### 4.4 Furos no modelo de dados
Não existem, e precisam existir: `subscriptions` (assinatura do lojista), `audit_log`, `notification_log` (o que foi enviado a quem, para não duplicar), `printer_configs`, `stores.timezone` (Brasil tem 4 fusos), `refunds`. Além disso: **valores monetários devem ser inteiros em centavos**, nunca float — não está escrito e é erro clássico.

## 🟡 5. Segurança e abuso (não tratados)
- **OTP:** rate limit por telefone/IP, senão vira porta para *SMS pumping* (fraude que gera custo real).
- **Geocoding:** cache obrigatório por CEP/endereço — sem isso a conta do Google escala com o tráfego, não com as vendas.
- **Cardápio público:** rate limit no storefront (scraping de preço por concorrente é comum).
- **Pedido falso:** "pagar na entrega" sem histórico → limite de valor para cliente novo (já mencionado nos riscos, nunca especificado).

## 🟢 6. Pendências menores (aceitáveis para depois)
Instrumentação de eventos · runbook de incidente · canal de suporte · Figma · fotos de produto · critérios de aceite · registro do domínio e INPI (ainda não confirmados!) · política de reviews.

---

## Ações imediatas (ordem)
1. **Corrigir o roadmap do plano** para refletir o MVP real. *(Feito — ver plano v1.6.)*
2. **Decidir o WhatsApp** (click-to-chat vs Cloud API). É a decisão mais importante que resta.
3. **Adicionar o épico de assinatura/billing do Molho** ao roadmap. *(Feito.)*
4. **Adicionar importação de cardápio por planilha ao MVP.** *(Feito.)*
5. Montar a planilha de unit economics. **30 minutos, e valida o preço.**
6. Registrar domínio e marca. Ainda pendente desde a 1ª auditoria.

## O que está pronto e não precisa de mais nada
✅ ICP · escopo · planos e preço · arquitetura · modularidade · RBAC · estratégia de pagamento · regras de cancelamento · impressão · offline · NFRs · estrutura do contrato · marca e design system.
