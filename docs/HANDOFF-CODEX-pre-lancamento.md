# Handoff para o Codex — execução do plano de pré-lançamento

Data: 26/08/2026
Fonte da verdade: `docs/12-plano-pre-lancamento.md` (Fase 0 já auditada, vereditos fechados).
Este handoff só traduz esse plano em ordem de execução. Não redecide nada — se achar
divergência entre este arquivo e o `docs/12-*`, o `docs/12-*` vence.

## Antes de tocar em qualquer arquivo

1. Ler `CLAUDE.md` inteiro (raiz do repo) — regras não-negociáveis, convenções de schema,
   modularidade, RBAC. Todo item abaixo tem que respeitar essas regras, sem exceção.
2. Ler `docs/12-plano-pre-lancamento.md` inteiro — cada tarefa abaixo referencia uma linha
   específica dele com o veredito e a evidência (arquivo/linha) que já foi levantada. Não
   re-auditar o que já tem `[OK]`.
3. **Épicos de roadmap (9b, 11, 12, 13, 13d, 10, 9c) NÃO fazem parte deste handoff.**
   Ficam rastreados só no `CLAUDE.md`, seção "Ordem dos épicos". Este handoff cobre
   exclusivamente robustez/segurança do que já existe no `main`.
4. Gate de toda tarefa: `pnpm lint && pnpm test && pnpm build` verdes — build **completo**,
   não só lint/typecheck isolado (CLAUDE.md explica por quê: cwd diferente entre raiz e
   `apps/<app>` já causou falso-positivo duas vezes).
5. Commits pequenos, imperativo em pt-BR, um item de cada vez.

---

## Ordem de execução

### 1. Legal / LGPD (maior prioridade — bloqueia go-live self-service)
Contexto: `docs/12-plano-pre-lancamento.md` §1A. As páginas de privacidade/termos **já
existem** em `apps/site/app/privacidade` e `apps/site/app/termos` — não redigir do zero.
O que falta é o produto usar isso:
- Linkar `/privacidade` e `/termos` no footer/rodapé de `apps/storefront` e
  `apps/backoffice` (hoje zero referência, confirmado por grep).
- Adicionar checkbox de aceite explícito no fluxo de checkout do cliente
  (`apps/storefront`) e, quando o Épico 13 (onboarding) existir, no signup — por ora só
  o checkout precisa, onboarding ainda não foi construído.
- Registrar o aceite com timestamp + versão do documento (auditável) — nova coluna/tabela
  conforme convenção de schema do CLAUDE.md (uuid v7, `tenant_id` primeiro no índice
  composto se aplicável, soft delete se for tabela mutável — aqui é append-only, então
  sem `deleted_at`).

### 2. Config barata (baixo esforço, pode entrar a qualquer momento)
Contexto: §1C.
- **Scan de dependência**: ligar Dependabot (ou Renovate) + `npm audit`/`pnpm audit` no
  CI. `.github/workflows/` só tem `ci.yml` hoje — CI é quality-only, não faz deploy
  (CLAUDE.md), então isso entra como job novo ou step no existente.
- **404 do backoffice**: confirmar se `apps/backoffice/app/not-found.tsx` segue a marca
  Brasa como o do storefront (`apps/storefront/app/not-found.tsx` já é OK, serve de
  referência). Ajustar se for o default do Next.
- HSTS e CSP **não entram aqui** — são decisão de PM já registrada (`docs/07-aprendizados.md`,
  `docs/08-plano-9c.md:490`), esperando TLS de `molho.live` validado em produção. Não ligar
  HSTS antes disso: trava o domínio fora do ar por dias, sem volta pelo servidor.

### 3. Tratamento de erro global
Contexto: §Fase 2. Hoje só `apps/api/src/catalog/catalog-exception.filter.ts` e
`apps/api/src/orders/order-exception.filter.ts` existem; `main.ts` não registra nenhum
filtro global (`app.useGlobalFilters`). Qualquer exceção fora desses dois módulos cai no
handler default do Nest.
- Criar um `ExceptionFilter` catch-all, registrar global em `main.ts`.
- Resposta consistente (formato de erro padrão), sem vazar stack trace em produção.
- Não duplicar o que os filtros de `catalog`/`orders` já fazem — o global é a rede de
  segurança pros módulos que não têm filtro próprio, os específicos continuam valendo
  onde existem (mais específico vence).

### 4. Mass assignment
Contexto: §Fase 2. 17 de 19 arquivos de `packages/contracts/src` com `z.object()` não
usam `.strict()`/`strictObject` (confirmado por grep) — inclui `cart.ts`, `address.ts`,
`signup.ts`, `admin-order.ts` e mais 13. Contratos primeiro (regra do CLAUDE.md): mexer
em `packages/contracts` antes de qualquer UI/API.
- Aplicar `.strict()` (ou `z.strictObject()`) em todos os schemas de `z.object()` que
  ainda não têm.
- Rodar a suíte inteira depois — schema mais rígido pode rejeitar payload que hoje passa
  por acidente (campo extra sendo enviado sem uso real). Isso é o teste de regressão que
  importa aqui, não é opcional.
- Fazer em lotes pequenos por arquivo/domínio, não um commit gigante — mais fácil de
  isolar qual endpoint quebrou se algo quebrar.

### 5. Upload seguro e otimizado — ACOPLADO à Fatia A do benchmark
Contexto: §1B. **Não fazer a Fatia A (galeria de fotos + vídeo, `docs/11-benchmark-concorrentes.md`)
sem isto.** Sem validação, galeria+vídeo é superfície de ataque; sem compressão, destrói
o storefront.
- **Restringir uploads**: `multer` já está instalado (`apps/api/package.json`) mas sem
  `fileFilter`, sem limite de tamanho, sem checagem de MIME real (não só extensão).
  Adicionar os três em `apps/api/src` onde o upload de imagem/vídeo de produto acontece
  (`apps/api/src/catalog/product-images.controller.ts` é o ponto de entrada mais provável
  — confirmar antes de editar).
- **Compressão de imagem**: sem `sharp` (ou equivalente) em `apps/api` hoje. Resize +
  compressão no upload, servidor, não cliente.
- **Vídeo** (novo, decorrente da Fatia A): limite de duração/tamanho, avaliar se precisa
  transcode. Definir junto com quem for desenhar a Fatia A — não é só backend isolado,
  é decisão de produto (quanto tempo de vídeo o plano permite, etc.).

### 6. Monitoramento
Contexto: §Fase 2. Só existe `apps/api/src/health/health.controller.ts` (healthcheck),
sem Sentry nem uptime externo monitorado.
- Ligar Sentry (free tier cobre o piloto) nos três apps (`apps/api`, `apps/storefront`,
  `apps/backoffice`) — ou confirmar com o Vinicius se prefere outra ferramenta antes de
  instalar dependência nova.
- Isso é **serviço externo** — checar `docs/marketplace`/integrações do Vercel se algum
  provisionamento via Marketplace já resolve, antes de configurar SDK cru.

### 7. Analytics no storefront
Contexto: §Fase 2. `apps/site` já tem o padrão pronto: `components/site-analytics.tsx` +
`components/cookie-consent.tsx` (PostHog/GA atrás de consentimento real, scripts só
carregam pós-aceite). **Reusar esse padrão em `apps/storefront`, não desenhar do zero.**
- Portar/adaptar os dois componentes pro storefront.
- Cardápio/checkout é onde a conversão real acontece — é ali que falta, não no site
  institucional (que já está coberto).

### 8. Recuperação de conta
Contexto: §1D. Molho é OTP, não senha — "reset de senha" não se aplica (N/A confirmado).
O que falta é o equivalente real: cliente/staff perde acesso ao e-mail/telefone do OTP,
não há fluxo documentado.
- Desenhar o fluxo mínimo pro MVP — pode ser simples (contato com suporte/admin), mas
  precisa existir e estar documentado, não implícito.
- Decisão de produto antes de código — se ficar ambíguo, perguntar antes de assumir.

---

## Fora do escopo deste handoff (não fazer, não decidir)

- **Responsividade real** (storefront mobile, gestor tablet) — não é auditável por grep,
  precisa QA manual/visual. Não é tarefa de código do Codex; sinalizar quando chegar a
  vez, não tentar resolver escrevendo CSS às cegas sem ver o resultado renderizado.
- **Secrets no histórico do git** — scan grep-based já rodou e não achou nada, mas não é
  prova formal (trufflehog real ainda não rodou). Não é bloqueante, não precisa agir
  agora; só rodar a ferramenta de verdade se o Vinicius pedir certeza de 100%.
- **HSTS/CSP** — decisão de PM já tomada e documentada (ver item 2 acima). Não ligar sem
  sinal explícito de que o TLS de produção foi validado.
- **Épicos 9b/9c/10/11/12/13/13d** — vivem só no `CLAUDE.md`. Não misturar com este
  backlog de robustez/segurança.

---

## Ao terminar cada item

- `pnpm lint && pnpm test && pnpm build` verdes (build completo, não só lint isolado).
- Atualizar o veredito correspondente em `docs/12-plano-pre-lancamento.md` de `[LACUNA]`
  pra `[OK]` com a evidência nova (arquivo/linha do que foi feito), mesmo padrão que já
  está no documento.
- Se mexer em `apps/api/src/orders/*`, `packages/contracts/src/*` ou migrations: revisão
  redobrada antes de merge (dinheiro, permissão ou contrato compartilhado).
