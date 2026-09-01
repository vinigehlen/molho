# Handoff para o Codex — correções antes de combos 4.2

Atualizado em: 2026-09-01

Status pós-sessão Codex: P1.1, P1.2, P1.3, P2.4 e P2.5 foram implementados
na fatia `codex/correcoes-pre-combos-4-2` (`c50c6c3`). P2.6 foi decidido na
fatia 4.2A: o modo de preço pertence a `ProductOffer`, com enum
`fixed | sum_of_items`.

## Objetivo

Corrigir as inconsistências encontradas na revisão pós-merge do PR
[#31](https://github.com/vinigehlen/molho/pull/31) antes de iniciar preço
dinâmico, personalização ou combo aninhado da fase 4.2.

O PR #31 já está em `main` no commit `ade4c04`. Este documento nasceu para
registrar as correções pré-4.2; o bloco de status acima indica o que já foi
fechado nesta fatia.

## Regra de parada

Não iniciar schema nem código de preço `sum_of_items` enquanto os três itens
P1 abaixo não estiverem resolvidos. O terceiro fecha uma corrida no caminho de
dinheiro do checkout.

## P1 — corrigir antes de qualquer implementação 4.2

### 1. Sincronizar a autoridade do Codex

**Problema:** `AGENTS.md` ainda lista combos entre os módulos fora do MVP e
manda não implementá-los. A exceção aprovada em 2026-08-28 existe somente em
`CLAUDE.md`. Para o Codex, um handoff em `docs/` não substitui `AGENTS.md`.

**Correção esperada:**

- remover `combos` da lista “Fora do MVP” em `AGENTS.md`;
- copiar para `AGENTS.md` a exceção de combos e sua sequência aprovada,
  mantendo o texto coerente com `CLAUDE.md`;
- não copiar mecanicamente outras divergências entre os dois arquivos;
- declarar `AGENTS.md` como primeira instrução para sessões Codex.

**Aceite:** nenhuma instrução ativa do Codex proíbe a fase 4.2 que o handoff
manda executar.

### 2. Atualizar a fonte da verdade detalhada

**Problema:** `docs/HANDOFF-CODEX-combos-4-2.md` diz que
`docs/HANDOFF-claude-code-combos.md` vence em caso de divergência, mas este
arquivo detalhado ainda afirma que:

- 4.1b está “em revisão”;
- a branch corrente contém a 4.1b;
- `main` parou depois da fase 3.

O estado real revisado é:

- 4.1a: PR #29, merge `a81f822`;
- 4.1b: PR #30, merge `694c5b7`;
- handoff 4.2: PR #31, merge `ade4c04`.

**Correção esperada:** atualizar `docs/HANDOFF-claude-code-combos.md` e, em
seguida, ajustar os dois handoffs para apontarem para uma única fonte atual.
Não manter dois documentos com precedência circular ou estados diferentes.

**Aceite:** buscar por “4.1b” nos dois handoffs retorna estado mesclado e os
mesmos commits/PRs.

### 3. Fechar a corrida da composição do combo

**Problema:** o checkout chama `findComboChildProductIds()` antes de qualquer
lock e depois trava os produtos/ofertas encontrados. Existe uma janela:

1. checkout lê os `combo_items` atuais;
2. outra transação insere um novo filho e commita;
3. checkout trava somente os filhos da leitura anterior;
4. a revalidação sob `READ COMMITTED` pode enxergar o novo filho sem que o
   produto e a oferta dele estejam travados.

Além disso, quantidade e soft-delete dos `combo_items` existentes não são
serializados pelo lock atual dos produtos. Isso é especialmente bloqueante no
modo `sum_of_items`, em que composição e quantidade passam a afetar dinheiro.

Arquivos envolvidos:

- `apps/api/src/orders/checkout-order.service.ts`;
- `apps/api/src/orders/checkout-order.repository.ts`;
- `apps/api/src/catalog/combo-item.repository.ts`;
- testes de checkout e e2e de banco.

**Direção segura sugerida:**

1. travar os produtos-pai solicitados em ordem determinística;
2. travar as linhas vivas de `combo_items` desses pais com `FOR UPDATE` e
   obter os IDs dos filhos na mesma operação;
3. travar produtos-filho e ofertas principais em ordem determinística;
4. só então revalidar e criar o snapshot;
5. preservar a mesma ordem de locks nos caminhos CRUD para não criar deadlock.

O lock do produto-pai também deve serializar novas inserções via FK; o lock
das linhas de `combo_items` serializa update/soft-delete das composições já
existentes. Validar esse comportamento no PostgreSQL real, não apenas em fake
repository.

**Aceite:** um teste concorrente prova que inserir, remover ou alterar a
quantidade de um filho não consegue mudar composição/preço entre a leitura
travada e a criação do pedido.

## P2 — corrigir no mesmo ciclo de documentação/modelagem

### 4. Remover a afirmação de CHECK contra combo aninhado

O banco possui somente:

```sql
CHECK (combo_product_id <> child_product_id)
```

Isso bloqueia autorreferência direta, não um filho com `kind = 'combo'`. Hoje
combo aninhado é barrado apenas por `ComboItemService.create()`.

**Correção esperada:** trocar o handoff para “validação somente na aplicação”.
Se a regra precisar de defesa no banco, usar migration nova com trigger; um
`CHECK` comum não consulta `products.kind` em outra linha/tabela.

### 5. Corrigir o diagnóstico ao trocar `Product.kind`

Trocar um produto de `combo` para outro tipo não faz soft-delete dos
`combo_items`. `ProductService.update()` apenas altera o produto; as linhas
continuam vivas, ficam ignoradas enquanto o pai não é combo e reaparecem se o
tipo voltar para `combo`.

**Correção esperada:** documentar o comportamento real e decidir com o PM uma
das opções antes da 4.2:

- bloquear a troca enquanto houver filhos vivos;
- exigir confirmação e fazer soft-delete explícito;
- preservar deliberadamente a composição para restauração posterior.

Não implementar limpeza silenciosa sem decisão, pois seria destrutiva.

**Decisão implementada após 4.2A:** bloquear a troca de `kind` quando o combo
tem filhos vivos. O lojista precisa remover os itens do combo antes de mudar o
tipo do produto.

### 6. Corrigir as alternativas de ownership de `combo_pricing`

`combo_items` representa composição por filho; não é um bom owner para uma
flag única `fixed | sum` do combo. As alternativas coerentes são:

| Owner | Semântica |
| --- | --- |
| `Product` | o modo é global e igual em todas as categorias/ofertas |
| `ProductOffer` | cada apresentação comercial pode ser fixa ou calculada; alinhado ao 4C |
| `ComboItem` | somente dados por filho, como contribuição, inclusão ou taxa; não o modo agregado |

**Decisão registrada na 4.2A:** o mesmo combo pode ter preço fixo numa
categoria e `sum_of_items` em outra. O modo pertence a `ProductOffer`, pois a
semântica acompanha a apresentação comercial criada no 4C.

## Estado das migrations

Em 2026-09-01, antes desta fatia, `pnpm --filter @molho/db db:migrate:status`
confirmou no Neon apontado pelo `.env.local` que estas três migrations estavam
pendentes:

- `20260831120000_product_kind_combo_fase3`;
- `20260831130000_combo_items_epico_combos_4a`;
- `20260831140000_order_item_components_combo_4b`.

Durante esta sessão elas foram aplicadas nesse banco local via
`pnpm --filter @molho/db db:migrate:deploy`, e o status voltou a
`Database schema is up to date!`. Isso comprova somente o banco configurado
localmente. Conferir staging e produção separadamente; não escrever “nenhum
banco” sem listar os ambientes verificados. Não editar essas migrations. Toda
evolução da 4.2 usa migration nova, idempotente e inspecionada conforme
`AGENTS.md`/`docs/07-aprendizados.md`.

## Ordem recomendada para a próxima sessão

1. Ler `AGENTS.md`, `docs/01-plano-produto.md`, `docs/02-definicoes-v1.md`,
   `docs/03-self-setup.md`, `docs/04-brand-design-system.md` e
   `docs/07-aprendizados.md`.
2. Corrigir autoridade e handoffs (P1.1, P1.2, P2.4 e P2.5).
3. Implementar e provar o lock da composição (P1.3) como fatia própria.
4. Implementar a primeira fatia funcional da 4.2 (`combo_pricing_mode` em
   `ProductOffer`).

## Gates da fatia de concorrência

- testes unitários dos repositories/services alterados;
- teste real de concorrência/RLS no PostgreSQL;
- `pnpm test:e2e` se o fluxo de checkout for alterado;
- da raiz: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`;
- `git diff --check`;
- nenhuma migration antiga editada.

## Prompt curto para a próxima sessão

> Continue pelas correções pré-4.2 descritas em
> `docs/HANDOFF-CODEX-correcoes-combos-4-2.md`. Resolva primeiro a autoridade
> documental e a corrida de composição do combo. Não inicie `sum_of_items`,
> personalização ou combo aninhado antes dos aceites P1. Preserve RLS,
> optimistic locking, estratégia expand/rollback e rode os gates completos.
