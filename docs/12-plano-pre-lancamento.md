# Plano de Pré-Lançamento — Auditoria de Robustez e Segurança

*Cruzamento de duas listas de "checklist antes de lançar" (robustez de produto + segurança) contra o estado real do Molho no main. Regra de ouro: a fonte da verdade é o git, NÃO a memória. Itens marcados [CONFIRMAR] precisam de verificação no repo antes de virar tarefa — não assumir que existem nem que faltam.*

## Como ler este plano
Cada item cai em um de quatro estados:
- **[OK]** — evidência clara de que está feito e maduro.
- **[CONFIRMAR]** — plausível que exista, mas sem evidência direta; Claude Code audita no repo e devolve veredito com arquivo/linha.
- **[LACUNA]** — evidência de que falta ou é frágil; vira tarefa de execução.
- **[N/A]** — não se aplica ao Molho (ex.: reset de senha num sistema OTP).

O plano tem 3 fases: **Fase 0** auditoria (fecha os [CONFIRMAR]), **Fase 1** execução do que já é [LACUNA] conhecida, **Fase 2** o que a auditoria promover a lacuna.

---

## FASE 0 — Auditoria (feita em 26/08/2026, ver veredito por item)

### Robustez de produto (lista 1)
- [OK — 27/08/2026] **Tratamento de erro global** — `apps/api/src/bootstrap/global-exception.filter.ts` registrado em `main.ts` via `app.useGlobalFilters(new GlobalExceptionFilter())`. O filtro preserva `HttpException` já mapeada por controllers/filtros de domínio e transforma erro desconhecido em 500 estável (`internal_server_error`) sem stack no corpo, registrando o detalhe no `Logger`.
- [OK] **Logs estruturados** — logging via `Logger` do Nest em 8 arquivos; só 1 `console.*` fora dele (`zenvia-sms.provider.ts:50`, `console.error('CRITICAL...')`, intencional pro guardrail de custo de SMS). `[getStorefront:debug]` do commit 4bd48a6 já foi removido — não existe mais no repo. Não é JSON estruturado, mas é consistente; não bloqueante.
- [OK] **Estados de loading no front** — `loading.tsx` existe em `apps/storefront/app` e `apps/backoffice/app` (raiz). Não audita cobertura de toda rota aninhada.
- [OK] **Estados de erro no front** — `error.tsx` existe nos dois apps.
- [OK parcial — 29/08/2026] **Responsividade real** — passe visual com Playwright em produção local: viewport mobile 390x844 no storefront e tablet 768x1024 no backoffice. Não houve overflow horizontal nas telas verificadas; screenshots ficaram em `artifacts/prelaunch-responsiveness/`. Limitação: o banco local não tinha tenant semeado e o gestor autenticado exige sessão real, então a validação final do cardápio real + fila do gestor ainda precisa rodar em staging com login.
- [OK parcial — 28/08/2026] **Monitoramento** — instrumentação Sentry adicionada na API e nos três fronts (`apps/api`, `apps/site`, `apps/storefront`, `apps/backoffice`) com ativação por env. A API chama `initSentry()` no bootstrap e o filtro global envia erro inesperado para monitoramento sem vazar stack para o cliente. Os fronts carregam Sentry no client/server/edge quando `SENTRY_DSN`/`NEXT_PUBLIC_SENTRY_DSN` existir. Ainda falta tarefa operacional fora do repo: criar projetos/DSNs no Sentry e configurar uptime externo para `/health`.
- [OK — 27/08/2026] **Analytics no storefront** — `apps/site` já tinha PostHog + GA atrás de consentimento. O mesmo padrão foi levado para `apps/storefront`: `components/storefront-analytics.tsx` captura page view e cliques só depois do aceite; `components/cookie-consent.tsx` mostra o banner quando analytics está configurado e grava a preferência em `localStorage`. `app/layout.tsx` injeta os dois componentes no cardápio/checkout.
- [OK — 28/08/2026] **Compressão de imagem** — rechecado: a compressão já acontece no backoffice antes do PUT direto no R2 (`apps/backoffice/lib/image-compression.ts`, chamado por `uploadProductImage`). O arquivo é redimensionado para borda máxima de 1600px, convertido para JPEG 0.82 e só substitui o original quando fica menor. Teste de regressão adicionado em `apps/backoffice/lib/image-compression.test.ts`. Não precisa de `sharp` na API enquanto o servidor não recebe binário de foto.

### Segurança (lista 2)
- [OK — 27/08/2026] **Mass assignment** — todos os `z.object()` de `packages/contracts/src/*.ts` foram trocados por `z.strictObject()`, incluindo objetos aninhados. Com isso, campo extra em payload validado por contract deixa de ser ignorado silenciosamente e passa a ser rejeitado. O teste de balcão foi atualizado para registrar a nova regra: `lineTotalCents` em item `unit` agora falha em vez de ser descartado.
- [OK — 27/08/2026] **Restringir uploads** — o importador de cardápio agora usa `fileFilter` no `multer`, mantém limite de tamanho e valida extensão + mimetype + assinatura mínima do arquivo antes de parsear. CSV binário e XLSX sem assinatura ZIP são rejeitados. Evidências: `apps/api/src/catalog/import/catalog-import.controller.ts`, teste `catalog-import.controller.test.ts`; o backoffice também deixou de oferecer `.xls`, que o backend não aceita.
- [OK — 27/08/2026] **Security headers** — headers básicos continuam em API e fronts; CSP foi adicionada em modo `Content-Security-Policy-Report-Only` na API, site, storefront e backoffice para observar violações sem quebrar hidratação/analytics. HSTS ficou preparado por opt-in (`MOLHO_ENABLE_HSTS=true`) com `max-age=15552000; includeSubDomains`, sem ligar por padrão antes do TLS final de `molho.live`.
- [OK — 26/08/2026] **Scan de dependência** — `.github/dependabot.yml` criado para npm/pnpm e GitHub Actions; `.github/workflows/ci.yml` roda `pnpm audit --audit-level high --ignore-unfixable` logo após `pnpm install --frozen-lockfile`. O audit bloqueia vulnerabilidade alta corrigível nova; advisories sem correção aplicável ao lockfile atual não quebram o CI. Também foram atualizados Next `15.5.20 → 15.5.21`, PostCSS direto para `8.5.26` e Prisma `7.8.0 → 7.10.0`, reduzindo o conjunto reportado pelo audit.
- [OK provável] **Trim de respostas de API** — 30 arquivos em `apps/api/src` usam padrão mask/omit/select; não é pontual (só o perfil de cliente), é prática espalhada. Não auditado endpoint a endpoint.
- [OK provável] **Secrets no histórico do git** — `git log --all -p` contra padrões conhecidos (`re_...` do Resend, `sk_live`, `AKIA...`, chave privada PEM) não achou nenhum match. Não é scan de entropia completo (trufflehog real) — se quiser certeza de 100%, rodar a ferramenta de verdade; grep-based é boa evidência, não prova formal.
- [OK] **Forçar HTTPS / HSTS** — `apps/api/fly.toml:31` tem `force_https = true`; Vercel força HTTPS por padrão nos dois fronts. Redirect confirmado. HSTS explícito é o mesmo item já rastreado acima (headers).

---

## FASE 1 — Execução: lacunas já conhecidas

Itens que a memória do projeto já indica como ausentes/frágeis. Não dependem da auditoria; podem começar. Divididos por território (gate CC vs UI/config solta).

### 1A. Legal / LGPD — MAIOR prioridade pré-go-live
- [CORRIGIDO — estava errado] ~~Política de privacidade — não existe~~ — **existe**: `apps/site/app/privacidade/page.tsx` (87 linhas, conteúdo real, não stub). Achado no re-check de 26/08/2026 (o grep original do doc só olhou `apps/site/app`, não `apps/site/components`, e por isso também errou o item de analytics abaixo).
- [CORRIGIDO — estava errado] ~~Termos de uso — idem~~ — **existe**: `apps/site/app/termos/page.tsx` (89 linhas).
- [OK — 26/08/2026] **Link + aceite chegam no checkout.** `apps/storefront/app/[slug]/tenant-menu.tsx` linka termos/privacidade no rodapé do cardápio; `apps/backoffice/app/layout.tsx` linka os documentos no rodapé global do painel; `packages/ui/src/components/mo-checkout-review-sheet.tsx` adiciona checkbox explícito e bloqueia "Confirmar pedido" até o aceite; `apps/storefront/lib/checkout-api.ts` envia `legalAcceptance` só no `POST /checkout/orders`; `apps/api/src/orders/dto/checkout-order-request.dto.ts`, `checkout-order.service.ts` e `checkout-order.repository.ts` validam/gravam versões + timestamp em `orders`; migration `packages/db/prisma/migrations/20260826090000_checkout_legal_acceptance/migration.sql` adiciona o snapshot auditável. Signup/onboarding continua fora porque o Épico 13 ainda não existe.

### 1B. Upload seguro e otimizado — ACOPLADO à decisão de fotos+vídeo
> Nota de acoplamento: a Fatia A do benchmark (múltiplas fotos + vídeo no produto) transforma estes três itens de "nice-to-have" em PRÉ-REQUISITO. Galeria + vídeo sem isto detona o storefront e abre superfície de ataque. Devem ser feitos JUNTO com a Fatia A, não depois.
- [OK — 27/08/2026] **Restringir uploads** — importação de cardápio protegida no ponto de entrada: `multer` filtra extensão/mimetype antes de montar o arquivo em memória; o controller valida o conteúdo mínimo antes de entregar ao parser. O fluxo de foto de produto já não usa upload pelo servidor: gera URL assinada com `contentType`/`contentLength` validados e PUT direto no R2.
- [OK — 28/08/2026] **Compressão/otimização de imagem** — o fluxo real não envia a foto para a API: o backoffice comprime no navegador e só então pede a URL assinada do R2. Evidências: `apps/backoffice/lib/image-compression.ts`, `apps/backoffice/lib/catalog-api.ts`, teste `apps/backoffice/lib/image-compression.test.ts`. Se no futuro existir upload binário server-side, aí sim entra `sharp`/worker no backend.
- [Novo, decorrente do vídeo] **Transcodificação/limite de vídeo** — vídeo curto exige limite de duração/tamanho + possível transcode. Definir no desenho da Fatia A.

### 1C. Config barata de segurança/robustez
- [OK — 27/08/2026] **HSTS + CSP** — CSP em modo report-only adicionada em `apps/api/src/bootstrap/security-headers.ts` e nos `next.config.ts` de `apps/site`, `apps/storefront` e `apps/backoffice`. HSTS fica pronto, mas só é enviado quando `MOLHO_ENABLE_HSTS=true`, evitando travar domínio antes do passe de fumaça de TLS em produção. Próximo passo pós-observação: transformar CSP de report-only para bloqueante.
- [OK — 26/08/2026] **Scan de dependência** — Dependabot ligado em `.github/dependabot.yml` para npm/pnpm e GitHub Actions; CI roda `pnpm audit --audit-level high --ignore-unfixable`. Upgrades aplicados: Next `15.5.21`, PostCSS `8.5.26`, Prisma `7.10.0`.
- [OK, confirmado em 29/08/2026] ~~Página 404 personalizada~~ — `apps/storefront/app/not-found.tsx` e `apps/backoffice/app/not-found.tsx` seguem a marca. No QA visual, a 404 do storefront revelou um bug de Server Component chamando `buttonVariants()` de módulo client; foi corrigido com classes estáticas equivalentes no próprio arquivo.
- [OK, confirmado na Fase 0] ~~Remover logs de debug~~ — `[getStorefront:debug]` já não existe no repo.

### 1D. Recuperação de acesso
- [N/A parcial] **Reset de senha** — Molho é OTP, não senha; "reset de senha" não se aplica.
- [OK — 27/08/2026] **Recuperação de conta** — fluxo MVP documentado em `docs/02-definicoes-v1.md` §5.6 e referenciado em `docs/09b-auth-backoffice.md`. Não há reset de senha: staff recupera acesso por troca auditada do destino de OTP via owner/suporte; cliente final faz novo checkout com novo contato, sem migração automática de histórico. Recuperação nunca emite sessão sem OTP.

---

## FASE 2 — Promovidos pela auditoria (feita em 26/08/2026)

Itens que a Fase 0 confirmou como lacuna e ainda não tinham dono em nenhuma fase:

- [OK — 27/08/2026] **Tratamento de erro global** — filtro catch-all criado em `apps/api/src/bootstrap/global-exception.filter.ts` e registrado no bootstrap da API. Erros HTTP esperados continuam com o corpo original; erros desconhecidos viram `{ statusCode: 500, error: 'internal_server_error', message: 'Erro interno no servidor.' }` sem vazar stack.
- [OK — 27/08/2026] **Mass assignment** — contracts endurecidos com `z.strictObject()` em `packages/contracts/src/*.ts`. Testes focados dos contracts, API, storefront e backoffice passaram antes do gate raiz, cobrindo o risco de rejeitar payload legítimo por acidente.
- [OK parcial — 28/08/2026] **Monitoramento** — Sentry pronto no código: API inicializa com `SENTRY_DSN`, captura 500 inesperado no filtro global e os três apps Next carregam configs client/server/edge por env. Pendência externa: criar DSNs/projetos no Sentry e monitorar `/health` por uptime checker.
- [OK — 27/08/2026] **Analytics no storefront** — padrão do site institucional reaproveitado no cardápio: banner de consentimento, PostHog/GA opcionais por env, page view do storefront e cliques de ações. Scripts não carregam antes do aceite.
- [OK — 26/08/2026] **Aceite de termos/privacidade chega no checkout** — páginas legais seguem em `apps/site`; links agora aparecem em `apps/storefront` e `apps/backoffice`; o checkout exige checkbox antes da confirmação e grava snapshot auditável em `orders.legal_terms_version`, `orders.legal_privacy_version`, `orders.legal_accepted_at`. Evidências: `packages/ui/src/components/mo-checkout-review-sheet.tsx`, `apps/storefront/lib/checkout-api.ts`, `apps/api/src/orders/dto/checkout-order-request.dto.ts`, `apps/api/src/orders/checkout-order.repository.ts`, `packages/db/prisma/schema.prisma`, migration `20260826090000_checkout_legal_acceptance`.
- [OK parcial — 29/08/2026] **Responsividade real** — Playwright validou ausência de overflow horizontal em mobile no storefront/404 e em tablet no login/estado sem sessão do backoffice. Screenshots em `artifacts/prelaunch-responsiveness/`. Falta o passe final em staging com tenant real e login de staff para cobrir cardápio completo e fila do gestor.
- [OK — 26/08/2026] **404 do backoffice** — `apps/backoffice/app/not-found.tsx` segue a marca Brasa e não é o default do Next.
- [Reforço, não bloqueante] **Secrets no histórico do git** — grep-based não achou nada, mas não é scan de entropia real. Rodar trufflehog se quiser 100% de certeza antes do go-live.

---

## O que já está OK (não retrabalhar)

Registrado para não gastar ciclo confirmando o que já é maduro:

**Robustez:** backup do banco (Neon gerenciado), staging real (Fly+Vercel+Neon), rate limit (namespaced, já battle-tested no incidente Upstash), migrations organizadas (disciplina documentada: falsos-drift, SQL à mão idempotente, shadow DB), validação de input no backend (zod + CHECKs), testes (e2e real, 471 unit + e2e contra Postgres/Redis), rollback (transacional provado no Épico 13; de migration com disciplina; de deploy via plataforma).

**Segurança:** esconder API keys (secrets em Fly/Vercel), rotação de secrets (disciplina provada — vazamentos no chat rotacionados), RLS (19 tabelas + policy tenant_isolation; FORCE é hardening pós-13 já mapeado), criptografia de dados (ciphertext + lookup hash + pepper + chaves versionadas), auth server-side (OTP+JWT, verify server-side), restringir acessos (RBAC + guards + PlatformContextGuard), proteger cookies (ACIMA da média: __Host- prefix, HttpOnly/Secure/SameSite=Strict, refresh opaco sha256, rotação com detecção de reuso via Lua atômico, anti-CSRF header), queries parametrizadas (Prisma), validação de inputs (zod .strict).

**Diagnóstico:** os ~12 itens de auth/dados/RLS/cookies estão em nível alto — não é onde o risco mora. O risco de pré-lançamento está concentrado em (1) legal/LGPD, (2) perímetro (upload, headers, deps), (3) front-end (loading/erro/responsividade/observabilidade) — este último quase todo em [CONFIRMAR] porque a memória do projeto é enviesada pra backend/infra.

---

## Sequência recomendada
1. ~~Fase 0 (auditoria)~~ — **feita em 26/08/2026**, vereditos acima. Só sobrou 1 item não-grepável (responsividade real).
2. ~~Fase 1A (legal)~~ — **feita em 26/08/2026** para checkout: links no storefront/backoffice, checkbox obrigatório e snapshot auditável no pedido. Signup fica para o Épico 13 porque onboarding ainda não existe.
3. **Fase 1B (upload seguro+otimizado)** — desenhar JUNTO com a Fatia A do benchmark (fotos+vídeo). Não fazer a Fatia A sem isto.
4. **Fase 1C (config barata)** — HSTS/CSP (decisão de PM já registrada, falta executar), deps. 404 e debug log já confirmados OK.
5. **Fase 2** — erro global, mass assignment, analytics e wiring de monitoramento já executados. Ainda dependem de ação externa: DSNs/projetos Sentry, uptime checker e QA visual em staging autenticado.

---
*Gerado em 23/08/2026, atualizado com auditoria da Fase 0 em 26/08/2026. Cruza a lista de robustez (20 itens) e a de segurança (20 itens) contra o estado do main. Companion do 11-benchmark-concorrentes.md (features de conversão) — juntos formam o backlog de pré-lançamento: features novas + robustez/segurança.*
