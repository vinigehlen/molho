# Handoff para Claude Code — Épico 4E

Atualizado em 2026-08-31. Este arquivo existe para permitir retomada segura caso a sessão do Codex termine antes do fechamento remoto.

## Estado no checkpoint

- Branch: `codex/epico-4e-biblioteca-complementos`
- Base: `origin/main@ee6316d` (inclui o merge do PR #16)
- Implementação: concluída
- Revisão visual Impeccable: `disposition: ship`, sem pendência material
- Migration `20260830143000_modifier_library_epico4e`: aplicada com sucesso no banco dev atual via `db:migrate:deploy`
- Gate final da raiz, após a última alteração de código: `pnpm lint && pnpm test && pnpm build` verde
- Contagens relevantes: API 578 testes; backoffice 181; contratos 320; UI 224; storefront 142; build 7/7 tasks
- PR/CI/merge: preencher na seção final quando concluído

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

1. Rode `git status --short` e preserve somente os arquivos já listados no commit/diff deste épico.
2. Confirme `git diff --check`.
3. Se houver qualquer alteração de código após este checkpoint, rode novamente, da raiz: `pnpm lint && pnpm test && pnpm build`.
4. Commit sugerido: `feat: completa biblioteca de complementos do cardápio`.
5. Push: `git push -u origin codex/epico-4e-biblioteca-complementos`.
6. Abra PR para `main`, acompanhe o job `quality` e só faça merge com CI verde.
7. Após merge, sincronize `main` com `git pull --ff-only origin main`, remova a branch local/remota quando seguro e atualize a seção abaixo.

## Cuidados

- Não edite a migration já aplicada no dev; qualquer evolução de schema precisa de uma nova migration.
- Não commite `.env.local`, Prisma gerado ou `.impeccable/`.
- A página de complementos é grande, porém o recorte foi mantido numa superfície única; não faça refactor estrutural durante o fechamento do PR.
- O `@molho/ui typecheck` isolado ainda encontra dois `implicit any` pré-existentes em `mo-card.stories.tsx`; o gate exigido deste repo é o build completo, que passou.

## Fechamento remoto

- Commit: pendente
- PR: pendente
- CI: pendente
- Merge em `main`: pendente
