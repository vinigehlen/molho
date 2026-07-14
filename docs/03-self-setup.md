# Molho — Self-Setup, Domínio Próprio e Tema da Loja
**Especificação · Julho/2026 · Fecha os itens 2 e 3 da 2ª auditoria**

## 0. Decisões travadas
1. **WhatsApp = click-to-chat no MVP.** O Molho nunca envia mensagem sozinho: monta o texto do status e abre o WhatsApp do lojista com a mensagem pronta (`https://wa.me/{fone}?text={msg}` codificado). Um toque e vai, **pelo número de sempre dele**. Sem Cloud API, sem verificação da Meta, sem custo por mensagem, sem risco de ban. Cloud API com número dedicado vira **opção paga na Fase 2**.
2. **Onboarding 100% self-service.** Nenhum passo depende de humano do Molho. O lojista cadastra, configura, personaliza e publica sozinho. O super-admin existe só para suporte e exceções — **nunca como etapa obrigatória**.

---

## 1. Princípios do self-setup
- **Time-to-first-order < 48h; time-to-published < 30 min.**
- **Nada bloqueia o próximo passo.** Tudo pode ser pulado e retomado; a loja só não *publica* sem o mínimo essencial.
- **Sempre há um preview ao vivo** ao lado — o lojista vê a loja dele nascendo.
- **Progresso salvo a cada campo** (autosave). Ele vai atender um cliente no meio e volta.
- **Checklist persistente** no topo do painel até 100% ("Faltam 2 passos para publicar sua loja").

## 2. Fluxo de cadastro (self-service)
```
Landing → "Criar minha loja grátis"
  1. Telefone → OTP (sem senha, sem cartão)
  2. Nome + nome do restaurante
  3. Slug da loja  → checagem de disponibilidade em tempo real
     → cria tenant, entitlements do plano em TRIAL (7 dias, todos os módulos do Pro)
  4. Cai direto no WIZARD (não numa tela vazia)
```
**Nunca pedir cartão no cadastro.** Cobrança só aparece no dia 6 do trial.

## 3. Wizard de configuração (7 passos)

| # | Passo | O que faz | Obrigatório p/ publicar |
|---|---|---|---|
| 1 | **Sua loja** | Nome, telefone/WhatsApp, endereço (com geocoding), CNPJ opcional | ✔ |
| 2 | **Horários** | Grade por dia da semana com turnos; feriados; "fechar agora" manual | ✔ |
| 3 | **Cardápio** | (a) **importar planilha CSV/XLSX** com template baixável, (b) **colar link do iFood** (v2), ou (c) cadastrar manual. Preview de importação com correção de erros linha a linha | ✔ (≥1 produto) |
| 4 | **Entrega** | Desenhar zonas no mapa (polígono ou raio em km), taxa e ETA por zona; pedido mínimo; retirada no balcão | ✔ |
| 5 | **Pagamento** | PIX (chave do lojista) · dinheiro · cartão na entrega. *PIX online real entra ao conectar o PSP (fase posterior)* | ✔ |
| 6 | **Sua marca** | Logo, cor, capa, descrição — ver §5 | — (tem default) |
| 7 | **Impressora** | Detecta SO → baixa o agente → **imprime cupom de teste** → só conclui quando o lojista confirma o papel | — (pode usar sem imprimir) |

**Fim:** botão gigante **"Publicar minha loja"** → confete (assinatura de motion do Molho) → mostra o link e o QR-code prontos para compartilhar no Instagram/WhatsApp.

## 4. Domínio (simplificado — decisão travada)

**Sempre e apenas `{slug}.molho.app`.** Sem domínio próprio, sem CNAME, sem verificação de DNS, sem TLS on-demand.

**O que isso elimina:** um épico inteiro (13c), o suporte de "meu DNS não propaga", a emissão de certificados e um vetor de falha em produção. **O que se ganha:** wildcard TLS único (`*.molho.app`), loja no ar em 1 segundo, e cada loja carregando o nome Molho — vira canal de aquisição.

- Slug validado em tempo real no cadastro (a–z, 0–9, hífen; 3–30 chars; blocklist de reservados e palavrões).
- Trocar o slug depois: permitido 1×, com redirect 301 do antigo por 90 dias.
- SEO por loja continua: `<title>` + meta description, **Open Graph com a capa dela** (o que aparece quando ela manda o link no WhatsApp), JSON-LD `Restaurant`/`Menu`, favicon com o logo dela e PWA manifest.
- Domínio próprio fica como **feature do Premium na Fase 3**, se algum cliente pedir. Não antes.

## 5. Tema: 4 templates (decisão travada)

Em vez de um seletor de cor livre (que exige rampa OKLCH, validação de contraste e ainda produz loja feia), o lojista **escolhe 1 entre 4 templates prontos**. Cada um é um conjunto fechado e testado de cor, header e densidade — todos aprovados em WCAG AA por construção.

| Template | Cor | Personalidade | Para quem |
|---|---|---|---|
| **1. Roxo** (padrão) | Roxo Molho `#820AD1` | Moderno, fintech, confiável | Quem não quer decidir. É o default |
| **2. Brasa** | Vermelho-tijolo `#D93025` | Apetitoso, quente, urgente | Hamburgueria, pizzaria, churrasco |
| **3. Folha** | Verde-profundo `#0F8A5F` | Fresco, natural, saudável | Saudável, natural, açaí, sucos |
| **4. Grafite** | Preto `#141216` + acento âmbar | Sofisticado, minimalista | Alta gastronomia, cafés, autoral |

**O que o lojista escolhe/envia:** template · logo · foto de capa · descrição curta · ordem das categorias.
**O que ele NÃO mexe:** tipografia, raios, espaçamento, layout, componentes, cores funcionais, cor do PIX.

**Implementação:** cada template é só um bloco de `--brand-*` no `theme_json` — quatro constantes em `packages/ui/themes.ts`. Sem cálculo de rampa, sem validação de contraste em runtime, sem "ajustamos seu tom". **Simples, previsível e toda loja fica bonita.**

Preview ao vivo dos 4 lado a lado no wizard, com o cardápio real dele já dentro.

## 6. Assinatura, trial e billing (self-service)
```
signup → TRIAL 7 dias (módulos do Pro, sem cartão)
  ↓ dia 5: banner "faltam 2 dias" + e-mail/WhatsApp
  ↓ dia 7: escolhe plano e paga (cartão recorrente ou PIX assinatura)
        └─ não pagou → GRACE 3 dias (loja no ar, banner no painel)
              └─ ainda não → SUSPENSO (storefront fora do ar, dados intactos 90 dias)
```
- Upgrade/downgrade self-service com pró-rata.
- **Cancelamento self-service em 2 cliques** (sem "fale com o consultor" — é posicionamento de marca).
- Dunning automático: 3 tentativas de cobrança + avisos.
- Exportação de dados (cardápio + clientes + pedidos em CSV) sempre disponível, inclusive na saída.
- Nota fiscal da mensalidade emitida automaticamente.

## 7. Impacto no roadmap
Substitui e amplia o antigo épico 13:

| # | Épico | Conteúdo |
|---|---|---|
| **13** | **Onboarding self-service + wizard** | Signup por OTP, criação de tenant, 7 passos, checklist persistente, preview ao vivo, publicar |
| **13b** | **Tema: 4 templates** | Seletor dos 4 temas + logo/capa/descrição; OG, favicon e PWA por loja |
| **13d** | **Assinatura e billing** | Trial, planos, cobrança recorrente, grace, dunning, suspensão, upgrade/downgrade, exportação, NF |

> Estes três são **parte do MVP** — sem eles não existe produto vendável, só demo.

## 8. Unit economics
Feita — ver `molho-unit-economics.xlsx`. Conclusão: o modelo fecha, mas **o Standard a R$ 99 tem margem bruta de 62%**, abaixo do padrão SaaS (>75%), porque o **suporte** come R$ 10,50 dos R$ 34,47 de custo. Break-even em **~24 lojas**.
