# Molho — Branding Guidelines & Design System
**Versão 1.0 · Julho/2026 · Documento oficial de marca e design**

Este documento define a identidade da marca Molho e o design system que a traduz em produto. Ele serve três públicos: marketing (branding), design (UI/UX) e engenharia (tokens e componentes — consumido pelo Claude Code via `packages/ui`).

---

# PARTE I — BRAND GUIDELINES

## 1. Fundamentos da marca

### 1.1 Essência
> **"O ingrediente que transforma."**

Um prato sem molho é comida; com molho, é experiência. O Molho é o ingrediente invisível que transforma um restaurante comum em uma operação digital redonda — sem taxas abusivas, sem caos no WhatsApp, sem papel na cozinha.

### 1.2 Propósito
Devolver ao dono de restaurante o controle (e a margem) do próprio negócio digital.

### 1.3 Posicionamento
Para restaurantes, lanchonetes e deliverys que perdem margem para marketplaces, o **Molho** é a plataforma completa de cardápio digital, PDV e delivery que automatiza a operação com a simplicidade de um app de banco digital — mensalidade fixa, zero taxa sobre vendas.

**Enquadramento competitivo:** o MisterCheff e similares vendem "sistema"; o Molho vende "experiência". Somos o Nubank de um mercado dominado por ERPs de aparência antiga.

### 1.4 Personalidade (arquétipos: O Cara Comum + O Mago)
| Somos | Não somos |
|---|---|
| Próximos, de cozinha, "gente como a gente" | Corporativos, formais, engravatados |
| Espertos e resolutivos | Tecnicistas, cheios de jargão |
| Bem-humorados q.b. | Piadistas ou infantis |
| Diretos e transparentes (preço, taxa, prazo) | Vendedores de promessa |
| Confiantes sem arrogância | Agressivos com concorrentes |

### 1.5 Manifesto (uso em institucional e onboarding)
> Todo prato bom tem um segredo. Não é a carne, não é a massa — é o molho.
> No seu negócio é igual: o segredo não é vender mais uma vez, é fazer o cliente voltar.
> A gente cuida do pedido, do pagamento, da entrega e da fidelidade.
> Você cuida do fogão. **Molho. O ingrediente que transforma.**

## 2. Identidade verbal

### 2.1 Tom de voz — 4 princípios
1. **Fala como gente, não como sistema.** "Pedido novo na área!" em vez de "Nova transação registrada".
2. **Direto ao ponto.** Frases curtas. Verbo primeiro. Uma ideia por frase.
3. **Do balcão, não do escritório.** Vocabulário do setor: comanda, praça, casa, salão, despacho, "fechou o caixa".
4. **Celebra o lojista.** Conquistas são dele, não nossas: "Você bateu seu recorde de vendas 🎉", nunca "O Molho aumentou suas vendas".

### 2.2 Léxico da marca
| Usar | Evitar |
|---|---|
| "seu delivery", "sua casa" | "a plataforma", "o sistema" |
| "pedido" | "transação", "ordem" |
| "entrar no Molho" | "logar", "efetuar login" |
| "salão" (módulo mesas) | "dine-in" |
| "no capricho" (sucesso) | "operação concluída com êxito" |
| Cliente do restaurante = "cliente" | "usuário final", "consumidor" |
| Dono do restaurante = "você" | "o lojista", "o parceiro" (em UI) |

### 2.3 Microcopy de referência
| Contexto | Copy |
|---|---|
| Saudação storefront | "Oi, {nome} 👋 Bateu a fome?" |
| Carrinho vazio | "Seu carrinho tá vazio. Bora resolver isso?" |
| PIX aguardando | "Só falta o PIX. Cola o código no app do seu banco e pronto." |
| Pedido confirmado | "Pedido na cozinha! A gente te avisa a cada passo." |
| Loja fechada | "A cozinha tá descansando 😴 Voltamos {horário}. Dá pra olhar o cardápio e já escolher!" |
| Fora da área de entrega | "Ainda não chegamos aí 😕 Mas dá pra retirar no balcão!" |
| Backoffice vazio (produtos) | "Nenhum prato por aqui ainda. Que tal cadastrar o carro-chefe da casa?" |
| Erro genérico | "Ops, algo queimou aqui do nosso lado. Já estamos apagando o fogo — tenta de novo em instantes." |
| Caixa fechado | "Caixa fechado no capricho. Bom descanso! 👋" |

### 2.4 Regras de escrita
- Sempre pt-BR informal ("você"), sem gerundismo ("vamos estar enviando" ❌).
- Emojis: máximo 1 por mensagem; nunca em erros críticos, valores financeiros ou telas fiscais.
- Números financeiros sempre com R$ e duas casas; datas "12 de julho", nunca "12/07" em copy conversacional.
- Nunca prometer ("entrega em 30 min garantidos" ❌ → "previsão: 30–40 min" ✅).

## 3. Identidade visual

### 3.1 Logo — "Pingo no O" (aprovado)

**Conceito.** O símbolo é o **"o" de molho** virado monograma: um anel espesso, perfeitamente circular — geometria confiável, vocabulário de banco digital — com um **pingo caindo**. Lê-se simultaneamente como letra, ícone e gota. É o ingrediente que transforma, capturado em movimento.

**Por que este.** Entre os três conceitos avaliados (Gota, Pingo no O, Respingo), o Pingo é o que melhor traduz o posicionamento: familiaridade fintech (Nubank, Stone) sem abrir mão do universo da comida. Funciona como letra dentro da wordmark e como ícone isolado — raro e valioso.

**Variações (kit em `molho-brand-kit/`):**
| Variação | Arquivo | Uso |
|---|---|---|
| Lockup horizontal | `01-lockup-horizontal/` | **Principal.** Site, e-mail, docs, apresentações |
| Lockup vertical | `02-lockup-vertical/` | Quadrados, embalagem, splash, QR de mesa |
| Símbolo | `03-simbolo/` | Isolado: app, avatar, padrões |
| Símbolo compacto | `03-simbolo/simbolo-compacto-roxo.svg` | **Obrigatório abaixo de 24px** (anel mais grosso, pingo maior) |
| Wordmark | `04-wordmark/` | Quando o símbolo já está presente no contexto |
| App / avatar / maskable | `05-app/` | Lojas, PWA manifest, robô de WhatsApp |
| Favicon | `06-favicon/` | SVG + PNG 16/32/48 |
| OG image | `07-social/` | Link preview (WhatsApp, LinkedIn) |
| Loader animado | `09-motion/loader-pingo.svg` | Loading: o pingo cai em loop de 1,4s |

**Construção.** Wordmark em Inter ExtraBold, tracking −1,2%, minúsculas (proximidade; padrão fintech BR). Símbolo em grid de 100×100 com anel de raio externo 32 e interno 17. Espaço entre símbolo e wordmark = 24% da altura do símbolo.

**Área de proteção:** altura do "o" da wordmark em todos os lados. **Tamanhos mínimos:** lockup 80px de largura (20mm impresso) · símbolo 24px.

**Cores por fundo:** claro → símbolo roxo #820AD1 + texto ink #141216 · roxo/escuro → tudo branco · impressão 1 cor/fiscal → tudo preto. Nunca roxo sobre roxo.

**Usos proibidos:** rotacionar, esticar, gradiente, sombra, contorno, recolorir fora da paleta, **separar o pingo do anel**, aplicar sobre foto sem overlay roxo 40%.

**White-label:** o logo do Molho não é substituído por tenant. O restaurante usa o próprio logo no storefront; o Molho assina discretamente no rodapé ("feito com Molho").

**Motion do símbolo:** o pingo é o único elemento que anima — cai e some (1,4s, ease-in-out). Usado em loader, splash e no confete de recordes. O anel nunca gira.

### 3.2 Cores

**Primária — Roxo Molho** (identidade da plataforma; nos storefronts white-label é o default substituível pelo tenant)
| Token | Hex | Uso |
|---|---|---|
| `purple-950` | #2D0A4E | Texto sobre lilás claro, sidebar backoffice |
| `purple-900` | #4B0082 | Hover de primário, headers escuros |
| `purple-700` | #6D0AAD | **Texto roxo acessível sobre branco (AA)** |
| `purple-500` | #820AD1 | **Cor da marca.** Botões, links, símbolo |
| `purple-300` | #B565F3 | Ilustrações, dataviz secundário |
| `purple-100` | #EFE1FB | Fundos de destaque, chips selecionados |
| `purple-050` | #F8F1FE | Fundos de seção |

**Neutros**
| Token | Hex | Uso |
|---|---|---|
| `ink-900` | #141216 | Texto principal |
| `ink-600` | #585666 | Texto secundário |
| `ink-400` | #8E8B9A | Placeholder, disabled |
| `line` | #E9E7EE | Bordas, divisores |
| `surface` | #F5F5F7 | Fundo de app |
| `white` | #FFFFFF | Cards, sheets |

**Funcionais**
| Token | Hex | Uso |
|---|---|---|
| `success-500` | #12A454 | Pedido confirmado, caixa positivo |
| `warning-500` | #F5A623 | Atenção, estoque baixo |
| `danger-500` | #E4404E | Erros, cancelamentos, estornos |
| `info-500` | #3D5AFE | Informativos neutros |
| `pix` | #32BCAD | Exclusiva para elementos PIX (cor oficial do Banco Central) |

**Cores de status de pedido (dataviz e timeline)**
`received` #3D5AFE · `preparing` #F5A623 · `ready` #B565F3 · `in_transit` #820AD1 · `completed` #12A454 · `canceled` #8E8B9A

**Regra 60-30-10:** 60% neutros claros, 30% ink, 10% roxo. O roxo é tempero, não prato principal — telas encharcadas de roxo são erro de marca.

**Contraste (WCAG AA obrigatório):** texto roxo sobre branco usa `purple-700`+; texto branco sobre roxo exige `purple-500`+; nunca `purple-300` para texto.

### 3.3 Tipografia
- **Família única: Inter** (Google Fonts, variável) — humanista, excelente em números tabulares (essencial em PDV/dashboard). Fallback: system-ui.
- **Números financeiros:** sempre `font-feature-settings: "tnum"` (tabular) em tabelas, caixa e dashboard.

| Token | Tamanho/linha | Peso | Uso |
|---|---|---|---|
| `display-lg` | 40/44 | 800 | Hero marketing |
| `display` | 32/38 | 700 | Números-destaque do dashboard |
| `title-lg` | 24/30 | 700 | Título de página |
| `title` | 20/26 | 600 | Título de card/sheet |
| `body-lg` | 18/28 | 400 | Descrições de prato |
| `body` | 16/24 | 400 | Padrão |
| `body-strong` | 16/24 | 600 | Preços, labels ativos |
| `caption` | 13/18 | 400 | Metadados, timestamps |
| `overline` | 11/16 | 600 caps +0.08em | Categorias, seções |

### 3.4 Iconografia, ilustração e foto
- **Ícones:** Lucide, stroke 1.75px, tamanhos 16/20/24/32. Cor `ink-600` default, roxo apenas quando interativo/ativo. Nunca ícones sólidos misturados com outline na mesma tela.
- **Ilustrações:** estilo flat com linha fina, paleta roxo + 1 acento; personagens diversos, cenas de cozinha/entrega reais do Brasil (marmita, moto, maquininha). Uso: onboarding, estados vazios, erros.
- **Fotografia (marketing):** comida de verdade, luz natural, mãos em ação, bastidor de cozinha — nunca stock genérico americano. Overlay roxo 40% quando houver texto sobre foto.
- **O símbolo da gota** pode virar elemento gráfico de apoio (padrões, splash, loading), sempre em roxo ou branco.

### 3.5 Motion
- **Princípio:** rápido como cozinha em hora de pico. Nada acima de 300ms.
- Curvas: `--ease-out: cubic-bezier(.2,.8,.2,1)` (entradas) · `--ease-in-out` (movimentos).
- Durações: micro 120ms · padrão 180ms · sheets/modais 240ms · celebração 600ms (única exceção).
- **Assinaturas:** (1) bottom sheets sobem com leve overshoot; (2) dot da timeline pulsa no status ativo; (3) confete roxo no primeiro pedido do dia e em recordes; (4) botão PIX "respira" enquanto aguarda pagamento.
- Respeitar `prefers-reduced-motion` sempre.

### 3.6 Aplicações da marca
- **App icon:** símbolo branco sobre roxo 500, cantos do sistema.
- **Avatar WhatsApp do robô:** símbolo sobre roxo; nome do bot: "Molho | {Nome do Restaurante}".
- **Maquininha/QR de mesa (impressos):** QR sempre com moldura branca, símbolo ao centro, CTA "Peça pelo QR — rapidinho".
- **E-mail:** header roxo com wordmark branca, corpo claro, botão primário roxo.

---

# PARTE II — DESIGN SYSTEM "TEMPERO"

O design system do Molho chama-se **Tempero**. Vive em `packages/ui` do monorepo, documentado em Storybook. Tudo abaixo é contrato para design e engenharia.

## 4. Design tokens (fonte da verdade)

Tokens em três camadas: **primitivos** (valores brutos) → **semânticos** (intenção) → **de componente**. Apenas semânticos são usados em componentes; white-label sobrescreve primitivos `brand-*` por tenant via `theme_json`.

```css
:root {
  /* ── Primitivos: cor ── */
  --purple-950:#2D0A4E; --purple-900:#4B0082; --purple-700:#6D0AAD;
  --purple-500:#820AD1; --purple-300:#B565F3; --purple-100:#EFE1FB; --purple-050:#F8F1FE;
  --ink-900:#141216; --ink-600:#585666; --ink-400:#8E8B9A;
  --white:#FFF; --surface:#F5F5F7; --line:#E9E7EE;
  --green-500:#12A454; --amber-500:#F5A623; --red-500:#E4404E;
  --blue-500:#3D5AFE; --pix:#32BCAD;

  /* ── Semânticos: cor (white-label troca só o bloco brand) ── */
  --brand:var(--purple-500); --brand-strong:var(--purple-700);
  --brand-subtle:var(--purple-100); --brand-faint:var(--purple-050);
  --on-brand:var(--white);
  --text:var(--ink-900); --text-muted:var(--ink-600); --text-disabled:var(--ink-400);
  --bg:var(--surface); --bg-card:var(--white); --border:var(--line);
  --positive:var(--green-500); --caution:var(--amber-500); --critical:var(--red-500);

  /* ── Espaço (escala 4pt) ── */
  --sp-1:4px; --sp-2:8px; --sp-3:12px; --sp-4:16px; --sp-5:20px;
  --sp-6:24px; --sp-8:32px; --sp-10:40px; --sp-12:48px; --sp-16:64px;

  /* ── Raio ── */
  --r-sm:8px; --r-md:14px; --r-lg:20px; --r-xl:28px; --r-pill:999px;

  /* ── Elevação ── */
  --e-1:0 1px 2px rgba(20,18,22,.05);
  --e-2:0 4px 20px rgba(20,18,22,.06);
  --e-3:0 12px 40px rgba(20,18,22,.12);

  /* ── Tipo ── */
  --font:'Inter',system-ui,sans-serif;

  /* ── Motion ── */
  --ease-out:cubic-bezier(.2,.8,.2,1); --ease-in-out:cubic-bezier(.4,0,.2,1);
  --t-fast:120ms; --t-base:180ms; --t-slow:240ms;

  /* ── Toque/foco ── */
  --touch-min:44px;
  --focus-ring:0 0 0 3px color-mix(in srgb, var(--brand) 35%, transparent);
}
```

**Config Tailwind:** mapear tokens semânticos em `tailwind.config.ts` (`colors.brand.DEFAULT = 'var(--brand)'` etc.) — componentes nunca usam hex direto. Lint rule: hex hardcoded em `apps/*` = erro de CI.

## 5. Biblioteca de componentes

Base: shadcn/ui re-estilizado com os tokens. Nomenclatura `Mo*` para componentes próprios.

### 5.1 Fundamentos
| Componente | Especificação essencial |
|---|---|
| **MoButton** | Variantes: `primary` (brand, on-brand, r-md, h-52px mobile/44px desktop, peso 600), `secondary` (brand-subtle + texto brand-strong), `ghost`, `danger`, `pix` (fundo --pix). Estados: hover escurece 8%, pressed scale .98, loading com spinner interno mantendo largura, disabled 40% + cursor bloqueado. Ícone opcional 20px à esquerda. |
| **MoInput** | h-52px, r-md, borda `--border`, foco = borda brand + focus-ring. Label sempre visível acima (nunca placeholder-como-label). Erro: borda critical + mensagem caption abaixo. Máscaras BR nativas: telefone, CPF/CNPJ, CEP, R$. |
| **MoCard** | bg-card, r-lg, e-2, padding sp-4/sp-6. Variante `interactive` com hover e-3 + translateY(-1px). |
| **MoChip** | pill, h-36px, usado em categorias e filtros; selecionado = brand-subtle + texto brand-strong + peso 600. Scroll horizontal com fade nas bordas. |
| **MoBadge** | pill caption; cores por status de pedido (tokens da seção 3.2); dot animado quando "ao vivo". |
| **MoSheet** | Bottom sheet mobile / modal lateral desktop. r-xl no topo, alça de arrasto, overlay ink 40%, entrada 240ms overshoot. Padrão para: detalhe de produto, carrinho, filtros, confirmações. |
| **MoStepper** | Controle de quantidade: botões circulares 44px, número display no centro. |
| **MoTimeline** | Vertical; dots 12px conectados por linha 2px; dot do status atual pulsa (anim 1.2s); passado = positive, futuro = line. |
| **MoSkeleton** | shimmer 1.2s; toda tela tem estado skeleton, nunca spinner de página inteira. |
| **MoEmptyState** | Ilustração 160px + título title + corpo body-muted + CTA primário. Copy do léxico (§2.3). |
| **MoToast** | Topo mobile/canto desktop, r-md, auto-dismiss 4s, variantes success/caution/critical/neutral. |
| **MoTabs / MoTable / MoSwitch / MoSelect / MoAvatar / MoTooltip** | Conforme shadcn com tokens; tabelas com tnum e linhas h-56px. |

### 5.2 Componentes de domínio
| Componente | Especificação |
|---|---|
| **MoProductCard** | Foto 1:1 r-md, nome body-strong (2 linhas máx), descrição caption-muted (2 linhas), preço body-strong; badge "Esgotado" (ink-400) desativa o card; botão "+" circular brand 44px canto inferior direito. Variante lista (foto à direita 88px) e grid. |
| **MoModifierGroup** | Título + regra ("Escolha até 2") + progresso; radio/checkbox 24px com área de toque de linha inteira; delta de preço alinhado à direita "+ R$ 4,00". |
| **MoCartBar** | Pill fixa inferior (sp-4 das bordas), fundo brand, e-3: contador em círculo on-brand à esquerda, "Ver carrinho" centro, total à direita. Some com scroll para baixo, volta ao subir. |
| **MoPixPanel** | QR 240px centralizado em card branco, countdown de expiração (mm:ss) acima, botão gigante "Copiar código PIX" (variante pix), estado "aguardando" com respiração no ícone; ao confirmar → check verde animado + haptic. |
| **MoOrderTicket** | Card do gestor de pedidos: nº grande, canal (ícone web/iFood/QR/PDV), tempo decorrido com cor progressiva (verde→âmbar→vermelho), itens resumidos, botões de transição de status full-width. |
| **MoKdsCard** | Alto contraste para cozinha: fundo ink-900, texto branco 20px+, borda esquerda 6px na cor do status, timer sempre visível. Modo daltonismo: padrões além de cor. |
| **MoMetricCard** | Dashboard: label overline, valor display tnum, delta com seta e cor positive/critical, sparkline 32px opcional. |
| **MoZoneMap** | Wrapper do mapa: polígonos com fill brand 20% + stroke brand; editor com vértices arrastáveis; legenda taxa/ETA. |
| **MoCourierPin** | Pin com avatar do entregador + pulso; rota tracejada brand. |
| **MoLoyaltyMeter** | Barra de progresso pill até próxima recompensa + saldo em destaque; animação de "pingo" ao ganhar pontos. |

### 5.3 Padrões de tela (blueprints)
1. **Storefront/Home:** header brand (saudação + endereço ativo com chevron) → busca pill → MoChips de categorias (sticky) → seções de MoProductCard → MoCartBar.
2. **Detalhe do produto:** MoSheet com foto full-width, nome/descrição, MoModifierGroups, observações (textarea), MoStepper + botão "Adicionar • R$ XX,XX".
3. **Checkout:** passos empilhados em cards (Endereço → Entrega/Retirada → Pagamento → Cupom) com edição inline, resumo colapsável, CTA fixo.
4. **Acompanhamento:** MoTimeline + mapa quando in_transit + card do entregador (nome, ligação) + ajuda via WhatsApp.
5. **Gestor de pedidos (backoffice):** colunas por status (kanban) com MoOrderTicket, som + destaque pulsante em pedido novo, contadores no topo.
6. **Dashboard:** grid de MoMetricCard (4/2/1 por breakpoint), filtro de período sticky, gráficos com no máx. 2 cores.
7. **PDV:** grid de produtos denso à esquerda, comanda à direita, teclado numérico próprio, alvo de toque 48px+ (uso com pressa e dedo gordo).

## 6. Regras transversais

### 6.1 Acessibilidade (bloqueante em code review)
Contraste AA; toque ≥44px; foco visível com `--focus-ring` (nunca `outline:none` sem substituto); labels em todos os inputs; ordem de tab lógica; `aria-live="polite"` em mudanças de status de pedido; dataviz nunca só por cor; `prefers-reduced-motion` respeitado; textos redimensionáveis até 200%.

### 6.2 White-label (storefront apenas) — 4 templates
O lojista escolhe **1 entre 4 templates fechados** (constantes em `packages/ui/themes.ts`), todos AA por construção: **Roxo** #820AD1 (padrão) · **Brasa** #D93025 · **Folha** #0F8A5F · **Grafite** #141216 + acento âmbar. Ele também envia logo, capa e descrição. **Não existe seletor de cor livre** — sem rampa em runtime, sem validação de contraste dinâmica. Nunca customiza: neutros, funcionais, cor PIX, tipografia, raios, espaçamento. Backoffice, KDS e apps operacionais são sempre roxo Molho. Rodapé do storefront: "feito com Molho".

### 6.3 Responsividade
Breakpoints: 0–639 (mobile, prioridade 1), 640–1023 (tablet/PDV), 1024+ (desktop backoffice). Storefront é mobile-first estrito; backoffice é desktop-first com versão mobile funcional do gestor de pedidos.

### 6.4 Conteúdo em UI
Toda string passa pelo léxico (§2.2) e i18n-ready (pt-BR default). Valores: `Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL'})`. Datas relativas ("há 4 min") no gestor; absolutas em relatórios.

### 6.5 Governança do design system
- Mudança em token/primitivo = PR com label `design-system` + aprovação de design.
- Novo componente exige: story no Storybook com todos os estados, testes de acessibilidade (axe), documentação de uso e anti-uso.
- Versionamento semver do `packages/ui`; breaking changes com codemod quando possível.
- Auditoria trimestral: telas fora do sistema entram em débito registrado.

## 7. Checklist de handoff para o Claude Code
- [ ] `packages/ui/tokens.css` com o bloco da §4 integral
- [ ] `tailwind.config.ts` mapeando tokens semânticos
- [ ] Componentes §5.1 com stories e testes axe
- [ ] Componentes de domínio §5.2 na ordem: ProductCard → ModifierGroup → CartBar → PixPanel → OrderTicket → MetricCard
- [ ] Blueprints §5.3 como templates de página
- [ ] Validador de tema white-label (contraste AA) em `packages/ui/theme`
- [ ] Copys da §2.3 em `packages/contracts/copy.pt-BR.ts`

---
*Molho © 2026 — "O ingrediente que transforma." Este documento evolui por PR; dúvidas de aplicação de marca passam pelo time de design.*
