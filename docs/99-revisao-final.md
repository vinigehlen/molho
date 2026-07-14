# Molho — Revisão Final Pré-Desenvolvimento
**3ª auditoria · Julho/2026 · Plano v2.0 (Release Candidate)**

## Status: PRONTO PARA O CLAUDE CODE — decisões D1 e D2 fechadas em 13/07/2026

Revisei os 6 documentos linha a linha, cruzando escopo × roadmap × registry × regras × prompt. Encontrei **7 inconsistências (corrigidas)**, **2 decisões abertas (agora fechadas — ver abaixo)** e **3 pendências externas (burocráticas)**.

---

## ✅ Inconsistências encontradas e JÁ CORRIGIDAS (v2.0)

| # | Problema | Correção |
|---|---|---|
| 1 | **Numeração de épicos conflitante.** A seção 5-D dizia que Asaas era o épico 21; a seção 8 dizia que 21 era KDS; o prompt citava "mock até o épico 21". Três verdades diferentes — o Claude Code iria se perder | Numeração única: **24 Asaas · 25 Mercado Pago/failover · 26 hardening · 27 NFC-e/franquias**. Prompt atualizado |
| 2 | **Registry de módulos com planos que não existem.** O código dizia `['basico','pro','max']`; os planos decididos são Standard/Pro/Premium. Pior: as atribuições conflitavam com a tabela de preços (KDS estava no Pro no registry, mas é Premium na tabela; idem PDV, mesas, iFood, campanhas) | Registry reescrito com `['standard','pro','premium']` e **100% alinhado à tabela de preços** da definições-v1. Cupons/promos/combos → Pro; PDV/KDS/mesas/iFood/campanhas → Premium |
| 3 | **A contradição mais grave: go-live com pagamento mock.** O piloto entra em produção no épico 14, mas o PSP real só chega no 24. Ninguém tinha escrito como o restaurante COBRA nesse intervalo | Definido: **no go-live o pagamento é PIX estático (chave do lojista) com confirmação manual** + pagar na entrega — exatamente como Cardapio.ai opera. O pedido entra como `received` com pagamento "a confirmar"; o lojista marca "pago" ao conferir o banco. Regras de expiração 15min e **estorno automático só valem a partir do PIX online (épico 24)** — antes, devolução é manual. Registrado no plano, nas definições e no prompt |
| 4 | **"Integração ao fim" ambígua e perigosa.** Se "fim" = depois da Fase 3, o plano Pro venderia "cartão online" (Fase 2) sem existir integração de cartão | Esclarecido: "fim" = **fim do MVP**. Os épicos 24–26 rodam **logo após o go-live, em paralelo à Fase 2**, assim que o KYC sair. O piloto não fica mais que 2–3 semanas em PIX manual |
| 5 | **Seção 4 (integrações) ainda recomendava Cloud API como principal** — contradizendo a decisão do click-to-chat | Tabela corrigida: MVP = click-to-chat (custo zero); Cloud API vira opção da Fase 2; **API não-oficial proibida** explicitamente |
| 6 | **Modelo de dados sem as tabelas da 2ª auditoria.** `subscriptions`, `refunds`, `audit_log`, `notification_log`, `printer_configs` e `stores.timezone` tinham sido apontadas mas nunca entraram no schema nem no prompt | Adicionadas ao modelo e ao prompt, junto com a regra **"todo valor monetário é inteiro em centavos, nunca float"** |
| 7 | **Documento de marca desatualizado** — §6.2 ainda descrevia seletor de cor livre com validação AA em runtime, e o prompt/scaffold citava 4 apps no MVP | Marca atualizada para os 4 templates; MVP declarado com 3 apps (storefront, backoffice, api) — KDS e courier nascem nas fases 2–3 |

## ✅ 2 decisões do Vinicius — FECHADAS em 13/07/2026

**D1 — Margem do Standard: mantém R$ 99/mês.** Opção (c). A margem bruta de 62% (contra o padrão SaaS de >75%) é **aceita conscientemente como custo de aquisição do Pro**: o Standard é a porta de entrada que tira o lojista do WhatsApp manual, e o upgrade para o Pro é que faz a margem. Não sobe para R$ 119 e não corta o suporte do Standard. Consequência para o épico 13d: a página de preços publica **Standard R$ 99 · Pro R$ 189 · Premium R$ 299** (mensal), sem asterisco.

**D2 — Nomes dos planos: Standard / Pro / Premium.** Mantidos em inglês. A alternativa pt-BR (Balcão / Salão / Casa Cheia) foi descartada. Estas são as chaves canônicas do registry de módulos (`plans: ['standard','pro','premium']`), do billing e da página de preços — **não mudam mais**.

## 🟡 3 pendências externas (nenhuma trava o código, todas travam o go-live)

1. **Registro de `molho.app` + busca/pedido no INPI** — pendente desde a 1ª auditoria. `molho.app` é o domínio de produção do MVP inteiro (decisão do subdomínio único). **Se ele não estiver disponível, o plano muda.** Verificar HOJE.
2. **KYC do Asaas + conta Mercado Pago sandbox** — 2 a 6 semanas de burocracia. Abrir agora para os épicos 24–26 não bloquearem.
3. **Contrato do lojista com advogado** — a estrutura de 11 cláusulas está pronta (definições §9); precisa virar documento assinável antes do primeiro cliente pago (não antes do piloto, que é acordo informal).

## ✅ Verificações que passaram (sem problemas)
- Escopo do MVP ↔ épicos 1–14: consistentes, sem feature órfã
- Regras de cancelamento ↔ máquina de estados: cobrem todos os caminhos
- RBAC ↔ módulos: dupla checagem especificada em todos os pontos
- Planos ↔ trial: unificado (trial = Pro por 7 dias)
- Design system ↔ brand kit ↔ templates: mesmos tokens, mesmos hexes
- Unit economics ↔ preços: consistente (com a ressalva D1)
- Self-setup ↔ subdomínio único: épico 13c removido de todos os lugares

## Documentação final (o que vai para o repo em `docs/`)
| Arquivo | Papel |
|---|---|
| `plano-produto-delivery.md` **v2.0** | Fonte da verdade: arquitetura, módulos, RBAC, pagamentos, roadmap, épicos, prompt |
| `definicoes-v1-molho.md` | ICP, MVP, preços, regras de negócio, contrato |
| `self-setup-molho.md` | Onboarding, templates, billing |
| `molho-brand-design-system.md` | Marca, tom de voz, design system Tempero |
| `molho-brand-kit/` | Logos e assets |
| `molho-unit-economics.xlsx` | Modelo financeiro vivo |

## Próximo passo
Épico 1: scaffold do monorepo + design system Tempero. D1 e D2 estão fechadas, então o épico 13d (billing) já nasce com preço e nomenclatura definitivos.

> **Correção ao prompt da §9 do plano:** ele mandava criar schema Prisma + seed "nesta primeira sessão". Isso está **desatualizado** — a tabela de épicos (§8) e o `CLAUDE.md` são a verdade: **Épico 1 = scaffold + design system apenas**; Prisma, RLS, registry de módulos, RBAC e seed são o **Épico 2**.
