# Handoff para Claude Code — Épico 4E

Atualizado em 2026-08-31. Este arquivo existe para permitir retomada segura caso a sessão do Codex termine antes do fechamento remoto.

## Estado final

- Branch de trabalho: `codex/epico-4e-biblioteca-complementos` (removida do remoto após o merge)
- `main`: `cf089b0`, sincronizada com `origin/main` (0 ahead / 0 behind)
- Implementação: concluída
- Revisão visual Impeccable: `disposition: ship`, sem pendência material
- Migration `20260830143000_modifier_library_epico4e`: aplicada com sucesso no banco dev atual via `db:migrate:deploy`
- Gate final da raiz, após a última alteração de código: `pnpm lint && pnpm test && pnpm build` verde
- Contagens relevantes: API 578 testes; backoffice 181; contratos 320; UI 224; storefront 142; build 7/7 tasks
- PR #22 mesclado em 2026-08-31; detalhes na seção final

## O que foi entregue

1. Contratos e banco
   - opções de complemento ganharam descrição, foto, disponibilidade, código PDV e ordem;
   - migration aditiva e idempotente, sem reescrever linhas existentes;
   - contratos de reordenação completa e cópia de grupo para um produto.
2. API e integridade
   - CRUD rico de opções, upload de foto, pausa, exclusão e reorder com optimistic locking;
   - cópia atômica de grupo compartilhado + opções, substituindo só o vínculo escolhido;
   - storefront, checkout, balcão e ajustes recusam opções pausadas;
   - `sortOrder` negativo é rejeitado em DTO e service.
3. Gestor
   - biblioteca tenant-wide com busca, filtros, seleção e ações em lote;
   - criação direta, reutilização, desvínculo confirmado e bifurcação explícita “editar todos”/“criar cópia”;
   - edição de regra e opção rica, foto, PDV, disponibilidade, ordenação e remoção;
   - skeleton real, estados vazios/erro/sucesso e alvo móvel mínimo de 44 px.
4. Storefront e acessibilidade
   - foto/descrição da opção renderizadas;
   - grupo opcional de escolha única oferece “Remover escolha”;
   - borda forte de campos, foco Brasa e tokens `critical-strong`.
5. Direção
   - `docs/04e-direcao-biblioteca-complementos.md` registra FORM, semente e promessas verificáveis;
   - `DESIGN.md` carboniza o Tempero e só promove padrões duráveis do 4E;
   - `.impeccable/design.json` foi validado localmente, mas está ignorado por `.gitignore` de propósito.

## Evidência visual local

Capturas ignoradas pelo Git em `.impeccable/review/`:

- `desktop.png`
- `desktop-editor.png`
- `mobile.png`
- `mobile-options.png`

O viewport móvel medido ficou em `innerWidth=390` e `scrollWidth=390`.

## Se precisar retomar daqui

1. Comece de `main` atualizada e confirme `git status --short --branch`; não há ação restante no Épico 4E.
2. Consulte `docs/04e-direcao-biblioteca-complementos.md` e `DESIGN.md` antes de estender essa experiência.
3. Não edite a migration já aplicada; qualquer evolução de schema precisa de uma migration nova.
4. Se houver nova alteração de código, rode da raiz `pnpm lint && pnpm test && pnpm build` antes de declarar o próximo recorte concluído.

## Cuidados

- Não edite a migration já aplicada no dev; qualquer evolução de schema precisa de uma nova migration.
- Não commite `.env.local`, Prisma gerado ou `.impeccable/`.
- A página de complementos é grande, porém o recorte foi mantido numa superfície única; não faça refactor estrutural durante o fechamento do PR.
- O `@molho/ui typecheck` isolado ainda encontra dois `implicit any` pré-existentes em `mo-card.stories.tsx`; o gate exigido deste repo é o build completo, que passou.

## Fechamento remoto

- Commit da feature: `c94e0a1` (`feat: completa biblioteca de complementos do cardápio`)
- PR: [#22 — Épico 4E: completa biblioteca de complementos](https://github.com/vinigehlen/molho/pull/22), `MERGED`
- CI: `quality` verde em 22m09s, incluindo 195/195 cenários de contraste; React Doctor 86/100 com 0 erros; os dois deploys Vercel verdes
- Check externo `Workers Builds: molho-uploads`: falha recorrente e não bloqueante, também presente nos PRs #13–#16; nenhum arquivo do Worker foi alterado no 4E
- Merge em `main`: `cf089b02ae01496f07d3b88d59b1d603bbb21dfc`, em 2026-08-31 18:06:30 UTC
