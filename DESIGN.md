---
name: Molho — Tempero
description: Design operacional com acabamento de fintech para a rotina de restaurantes brasileiros.
colors:
  brasa: "#D63A1E"
  brasa-strong: "#A81E16"
  brasa-faint: "#FEF1EE"
  ink: "#141216"
  ink-muted: "#585666"
  surface: "#F5F5F7"
  card: "#FFFFFF"
  line: "#E9E7EE"
  field-border: "#8E8B9A"
  positive: "#12A454"
  caution: "#F5A623"
  critical-strong: "#C62F3B"
typography:
  display:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "32px"
    fontWeight: 700
    lineHeight: "38px"
  title:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "26px"
  body:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
  label:
    fontFamily: "Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: "18px"
rounded:
  small: "8px"
  control: "14px"
  card: "20px"
  sheet: "28px"
  pill: "999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  5: "20px"
  6: "24px"
  8: "32px"
  12: "48px"
components:
  button-primary:
    backgroundColor: "{colors.brasa}"
    textColor: "{colors.card}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 20px"
  button-danger:
    backgroundColor: "{colors.critical-strong}"
    textColor: "{colors.card}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 16px"
  input:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.control}"
    height: "44px"
    padding: "0 12px"
  card:
    backgroundColor: "{colors.card}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "16px"
  filter-chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.pill}"
    height: "44px"
    padding: "0 12px"
---

# Design System: Molho — Tempero

## Overview

**Creative North Star: "Balcão Fintech"**

Tempero combina a clareza e o acabamento de uma fintech com o ritmo concreto de uma cozinha. A interface é confiante, calorosa e operacional: muita informação pode coexistir, desde que continue escaneável, explícita e pronta para uso sob pressão.

Brasa identifica ação e seleção; não colore a tela inteira. Superfícies frias, cartões claros e texto quase preto preservam leitura. A microcopy fala de cardápio, comanda e restaurante, nunca de uma plataforma abstrata.

**Key Characteristics:**

- Hierarquia compacta e inequívoca para decisões rápidas.
- Cor de marca rara o bastante para continuar significativa.
- Estados reversíveis e alcance de mutações sempre visíveis.
- Acessibilidade medida: contraste AA, foco visível e toque mínimo de 44 px.

## Colors

A paleta usa Brasa como assinatura e neutros frios como área de trabalho. Os tokens do frontmatter são normativos; componentes usam papéis semânticos, nunca hex local.

### Primary

- **Brasa:** ação primária, seleção e vínculo com a marca.
- **Brasa Forte:** hover e texto de marca sobre fundos claros.
- **Brasa Névoa:** fundo de seleção e ênfase suave.

### Neutral

- **Tinta:** texto e ações neutras de alto contraste.
- **Tinta Suave:** descrição, metadado e hierarquia secundária.
- **Superfície Fria / Cartão:** canvas operacional e área elevada.
- **Linha / Borda de Campo:** `line` divide sem pesar; `field-border` delimita campos com contraste não textual suficiente.

### Named Rules

**The Brasa Is a Verb Rule.** Brasa marca ação, seleção ou foco; grandes áreas neutras carregam o conteúdo.

**The Strong Critical Rule.** Texto e preenchimento destrutivo usam `critical-strong`; o crítico médio serve apenas como apoio decorativo.

## Typography

- **Display Font:** Inter (system-ui, sans-serif)
- **Body Font:** Inter (system-ui, sans-serif)

**Character:** direta, brasileira e sem afetação. Peso e tamanho criam hierarquia; caixa alta fica restrita a overlines curtos. Valores financeiros e operacionais usam algarismos tabulares.

### Hierarchy

- **Display** (700, 32/38): título de página e momento principal.
- **Title** (600, 20/26): seção ou decisão dentro de um fluxo.
- **Body** (400, 16/24): instrução e conteúdo principal.
- **Label** (600, 13/18): rótulo persistente, regra e metadado.

## Layout

O ritmo nasce da escala de 4 px. Cards usam 16–24 px de padding e agrupam uma decisão coerente. O backoffice prioriza desktop, mas reflowa para uma coluna funcional entre 0–639 px; filtros podem rolar horizontalmente e nunca forçam a página além do viewport.

Superfícies Operate podem combinar uma linha fechada, própria para busca e comparação, com expansão progressiva no mesmo card. Esse padrão é adequado quando abrir outra página faria o operador perder contexto; não é uma obrigação para toda lista.

## Elevation & Depth

Tempero é plano por padrão. Borda e contraste tonal separam superfícies; sombras baixas entram em cards relevantes e sombras maiores ficam para overlays, sheets ou interação. O foco usa um halo Brasa de 3 px e respeita `prefers-reduced-motion`.

**The Flat-by-Default Rule.** Elevação comunica camada ou resposta a interação, nunca decoração gratuita.

## Shapes

Controles têm cantos gentilmente arredondados (14 px), cards operacionais usam 20 px e sheets 28 px. Pills ficam para filtro, status e metadado curto. Bordas de formulário são fortes; divisores e contornos de card são deliberadamente leves.

## Components

### Buttons

- **Primary:** Brasa, texto branco, peso 600 e altura mínima de 44 px.
- **Danger:** `critical-strong`, nunca o tom crítico médio com texto branco.
- **Hover / Focus:** mudança semântica curta (120–180 ms) e halo Brasa visível; `outline: none` só existe junto do substituto.

### Chips

- **Style:** pill neutra para filtro; selecionada recebe fundo Brasa Névoa, borda e texto Brasa Forte.
- **State:** `aria-pressed` ou equivalente torna seleção verificável sem depender apenas da cor.

### Cards / Containers

- **Corner Style:** 20 px em superfícies principais; 14 px em blocos internos.
- **Background:** cartão branco sobre superfície fria, com borda leve.
- **Operational library:** linha escaneável fechada e edição progressiva aberta podem compartilhar o mesmo card.
- **Shared-impact fork:** antes de editar um recurso reutilizado, explicitar o alcance e oferecer editar todos ou criar cópia independente.

### Inputs / Fields

- **Style:** label sempre visível, fundo claro, 14 px e borda `field-border`.
- **Focus:** borda de marca e halo Brasa.
- **Error / Disabled:** erro em `critical-strong`; disabled usa superfície e texto sólidos, nunca opacidade global.

### Navigation

Desktop usa sidebar clara com item ativo Brasa. Mobile reduz a navegação sem sacrificar nome do restaurante nem acesso às áreas centrais.

### Loading and feedback

Skeleton preserva a forma aproximada do conteúdo durante carga. Sucesso, erro e confirmação aparecem perto da ação; remoção, desvínculo e mutação compartilhada deixam consequências explícitas antes do commit.

## Do's and Don'ts

### Do:

- **Do** usar tokens semânticos do Tempero e manter a escala de 4 px.
- **Do** preservar alvo mínimo de 44 px, foco visível e rótulo persistente.
- **Do** mostrar o alcance de edições compartilhadas e uma saída segura.
- **Do** usar skeleton em cargas de tela e números tabulares em dinheiro e métricas.

### Don't:

- **Don't** usar hex local em componentes ou transformar Brasa em preenchimento indiscriminado.
- **Don't** usar borda decorativa fraca como única pista de um campo editável.
- **Don't** usar opacidade para desabilitar texto, nem `critical` médio para texto destrutivo.
- **Don't** promover a composição específica de uma tela a regra global sem recorrência comprovada.
