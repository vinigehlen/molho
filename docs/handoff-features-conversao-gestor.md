# Handoff — Features de conversão + redesenho do gestor

> Instrução pra colar no Claude Code. **Primeira ação: ler o contexto antes de escrever qualquer código.**

## 0. Contexto obrigatório antes de começar

Leia, nesta ordem, antes de desenhar qualquer coisa:

1. `CLAUDE.md` (raiz) — convenções, regra do hook anti-main, "1 commit por ideia".
2. `docs/06-backlog-ux.md` — é aqui que estas 6 frentes devem ser registradas como itens de backlog. Não existe um arquivo único de "roadmap de épicos"; a numeração de épico vive espalhada entre os `docs/0X` e o `CLAUDE.md`. Antes de nomear/numerar qualquer épico novo, confira a numeração já usada no git/main — a fonte da verdade do "que já foi feito" é o git, não a memória de ninguém.
3. `packages/db/prisma/schema.prisma` — modelos `Product`, `Order`, e o enum de `OrderStatus`, `PaymentMethod`, `FulfillmentType`.
4. `apps/backoffice/app/gestor/` — componente do board kanban do gestor (é kanban com colunas por status, confirmado).
5. `packages/contracts/src/` — contratos zod existentes, pra seguir o padrão.

Regra de parada: se qualquer fatia abaixo te levar a sair do escopo descrito, **PARA e avisa o Vinicius** — não expande.

---

## 1. Divisão em duas fatias (NÃO misturar num commit só)

- **Fatia A (schema + contrato — território dono-único CC, passa pelo gate de review):** múltiplas fotos por produto, cupom de desconto, agendamento de pedido.
- **Fatia B (UI pura — pode andar mais solta):** badge de promoção no card do storefront, redesenho dos botões de ação do gestor, colunas configuráveis do kanban, faxina de emoji + regra no `CLAUDE.md`.

Cada fatia em branch própria a partir do **main atual** (worktree isolado quando possível). Atenção: o Vinicius pode estar numa worktree órfã (`molho-epico-13-onboarding`) — **não** crie branch a partir dela; o épico 13 já está no main. `git checkout main && git pull` antes de ramificar.

Cada ideia = 1 commit, imperativo pt-BR.

---

## FATIA A — schema + contrato

### A1. Múltiplas fotos por produto

**Por quê:** os concorrentes (OlaClick à frente) tratam foto como driver de ticket; hoje o Molho tem foto única. Card de venda precisa de galeria.

**Escopo:**
- Modelar N fotos por produto. Decidir entre tabela `product_images` (id, product_id, tenant_id, url, position, created_at) **ou** coluna de array — recomendo **tabela** pela ordenação (`position`) e pra não inflar a row do produto. FK composta `(product_id, tenant_id)` à mão, seguindo o guardrail de isolamento já usado no schema.
- Migração aditiva. **Migrar a foto única existente** (`Product.imageUrl` ou equivalente) pra primeira linha da nova tabela (`position = 0`) num data-migration, sem perder as fotos atuais da Cabanhas.
- Manter compat: se algo lê `imageUrl` singular, expor a foto de `position=0` como capa (getter/derivado) até o storefront consumir a galeria.
- Contrato: `productResponseSchema` ganha `images: [{ url, position }]` ordenado. CRUD de imagem no admin (adicionar, remover, reordenar).
- RLS: nova tabela é tenant-scoped → `ENABLE ROW LEVEL SECURITY` + policy `tenant_isolation`, igual às 19 tabelas existentes.

**Cuidado:** o falso-drift do `updated_at DROP DEFAULT` e o drop das FKs compostas — arrancar do `migration.sql` antes de aplicar, conforme o `CLAUDE.md`.

### A2. Cupom de desconto (v1 ENXUTO)

**Escopo v1 — só isto, nada além:**
- Tipo de desconto: percentual **ou** valor fixo.
- Valor mínimo do pedido pra aplicar.
- Validade (data de início e fim).
- Limite total de usos (contador global do cupom).
- Código do cupom (string, único por tenant).

**Explicitamente FORA do v1 (v2):** limite por cliente, janela de horário, primeira-compra. Motivo: limite-por-cliente e primeira-compra exigem identificar cliente de forma confiável no checkout anônimo — não vale a complexidade agora.

**Modelagem:**
- Tabela `coupons` tenant-scoped (RLS + policy tenant_isolation + FORCE alinhado ao padrão). Campos: id, tenant_id, code, discount_type (percent|fixed), discount_value, min_order_cents, starts_at, ends_at, max_uses, uses_count, active, timestamps. Unique `(tenant_id, upper(code))`.
- Aplicação no checkout: validar código (existe, ativo, dentro da validade, atingiu valor mínimo, ainda tem uso disponível) → aplicar desconto ao total. Incrementar `uses_count` de forma **atômica** (o `max_uses` é uma corrida clássica — usar update condicional `WHERE uses_count < max_uses` e checar linhas afetadas, mesmo padrão do optimistic lock de zona no P1.2).
- **Invariante de dinheiro:** o desconto não pode quebrar a CHECK `orders_total_equals_sum`. Rever: hoje `total = subtotal + fee`. Com desconto vira `total = subtotal + fee - discount`. Isso exige **coluna nova** `discount_cents` no pedido + ajustar a CHECK. Tratar com o mesmo cuidado do contrato B do balcão (não sobrescrever total cru).
- Contrato: endpoint admin CRUD de cupom + campo opcional `couponCode` no checkout; response do pedido expõe `discountCents` e o cupom aplicado.
- e2e: cupom válido aplica; expirado/inativo → rejeita; abaixo do mínimo → rejeita; esgotado (max_uses) → rejeita; corrida de dois usos no último uso disponível → só um vence.

### A3. Agendamento de pedido

**Escopo:**
- Cliente escolhe data + horário pra receber/retirar. Lojista controla os slots: horários disponíveis, quantidade máxima de pedidos por slot, datas especiais (bloqueio/feriado).
- Reaproveitar `store_hours` existente (Bloco 5) como base do "quando a loja opera"; agendamento é uma camada em cima (quais slots dentro do horário aceitam pedido futuro + teto por slot).
- Modelagem: `Order` ganha `scheduled_for` (nullable — null = "o quanto antes", comportamento atual preservado). Config de slots/teto por loja: tabela ou settings — decidir e documentar.
- Validação: `scheduled_for` tem que cair dentro de horário de funcionamento e não estourar o teto do slot. Teto por slot é outra contagem concorrente → mesmo cuidado atômico.
- Contrato + e2e: agendar dentro do horário OK; fora do horário → rejeita; slot cheio → rejeita; sem agendamento (null) → fluxo atual intacto.
- Storefront e gestor mostram `scheduled_for` quando presente (gestor precisa ordenar/destacar agendados — coordenar com Fatia B).

---

## FATIA B — UI pura

### B1. Redesenho dos botões de ação do gestor

**Problema atual:** fileira de ações heterogêneas (Imprimir, Preparar, Pronto, Saiu para entrega, Voltar etapa) todas com peso visual parecido — polui e não guia o olho no pico.

**Padrão a implementar — UMA ação primária por card, ditada pelo status:**

| Status do pedido | Botão primário (único, preenchido, cor Brasa) |
|---|---|
| `received` | **Preparar** |
| `preparing` | **Pronto** |
| `ready` + delivery | **Saiu para entrega** |
| `ready` + pickup/balcão | **Concluir** |

**Ações utilitárias deixam de ser botões de texto:**
- **Imprimir** → ícone de impressora no canto do card (utilitário, não avança fluxo).
- **Voltar etapa** e **Cancelar** → menu de overflow (ícone de três pontos / "mais ações"). São exceção, não caminho feliz.

**Resultado por card:** 1 botão preenchido + 1 ícone de impressora + 1 overflow. Consistente em todos os status → o operador sempre encontra a ação principal no mesmo lugar.

- Ícones **da biblioteca de ícones do design system**, nunca emoji.
- Botão primário usa o token primário Brasa (`#D63A1E`) com os estados hover/text que o design system "Tempero" já deriva.
- Não inventar cor nova; consumir os tokens existentes.

### B2. Colunas configuráveis do kanban

- Permitir ao lojista definir a **posição/ordem das colunas de status** no board (ex.: "em preparo" à esquerda, "concluído" à direita).
- Persistir a preferência (por loja/usuário — decidir; provável por loja). Como é preferência de layout, não precisa de migração de peso; avaliar settings existente.
- Não alterar a máquina de estados — só a ordem visual das colunas.
- Pedidos **agendados** (da Fatia A) precisam de tratamento visual no board: destacar ou ordenar por `scheduled_for`. Coordenar com A3.

### B3. Badge de promoção no card (storefront)

- Quando o produto tem desconto ativo (via cupom aplicável ou preço promocional), exibir **badge no card do produto** (ex.: "-20%" ou "Promoção") — desconto visível no card, não só no checkout.
- Consumir o dado de desconto; não recalcular regra de negócio no front.
- Sem emoji no badge.

### B4. Faxina de emoji + regra no CLAUDE.md

- **Remover todos os emojis** de UI e copy voltada ao usuário — storefront e backoffice: componentes, labels, botões, toasts, mensagens de status, seeds e dados de exemplo. Varredura grep de resíduo (mesmo método da troca de cor Brasa), review antes do main.
- **Adicionar regra dura ao `CLAUDE.md`** (seção de convenções de UI), texto:

  > **Sem emojis em UI ou copy de produto.** Nenhum emoji em componentes, labels, botões, toasts, mensagens de status, ou texto voltado ao usuário final (storefront e backoffice). Ícones vêm da biblioteca de ícones do design system, não de emoji. Vale também para seeds e dados de exemplo. Exceção: nenhuma.

---

## 2. Registro no backlog

Ao final, registrar as 6 frentes em `docs/06-backlog-ux.md` com o status real (feito / em andamento), ancorando na numeração de épico que o git/main já usa. Não criar numeração nova sem conferir a existente.

## 3. Gate de review

Fatia A toca `packages/contracts`, `packages/db` e caminho de dinheiro (desconto no total) → **espera o review do Claude/Vinicius antes do merge** (as 4 áreas de raio-alto). Fatia B é UI → auto-merge de baixo risco permitido, mas o redesenho dos botões passa por olho do Vinicius no navegador antes do main (validar em ambiente real, não só teste verde).
