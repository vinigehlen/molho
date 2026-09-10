# Divisão paralela — Zero NO-GO entre Codex e CC

**Data-base:** 09/09/2026
**Última atualização Codex:** 10/09/2026
**Plano mestre:** `docs/14-plano-zero-no-go.md`
**Publicação:** `docs/13-plano-go-live-producao-cabanhas.md`
**Objetivo:** executar `NG-01` a `NG-15` no menor caminho crítico possível, com exatamente duas trilhas técnicas e sem conflito de arquivos.

## 1. Papéis

### Codex — release captain e produto público

Responsável por:

- storefront e resolução de tenant por domínio;
- BFF público e E2E de navegador;
- site, backoffice, URLs, metadata e headers dos fronts;
- configuração e telemetria dos fronts;
- projetos Vercel e release candidate dos fronts;
- coordenação de decisões, jurídico, Cabanhas e matriz de evidências;
- integração final, dry run e GO/NO-GO.

### CC — backend, dados e runtime

Responsável por:

- API, contratos e Prisma;
- configuração fail-fast do backend;
- credencial e operação do agente de impressão;
- readiness, Sentry da API, scrubbing e alertas técnicos;
- Neon, Upstash Redis, R2 e Fly.io;
- migrations, restore, cross-instance e rollback da API;
- suporte técnico ao dry run.

### Gates humanos

Alguns resultados não podem ser autoaprovados por nenhum agente:

- PM decide slug, checkout guest, pagamentos, backup/plano e domínio de assets;
- jurídico aprova termos, privacidade e DPA;
- Cabanhas aprova dados, cardápio, PIX, operação e teste físico;
- responsável técnico autoriza o corte e assume o plantão.

Esses gates pertencem a `NG-01`, `NG-14` e `NG-15`. Os agentes preparam e coletam evidências, mas não substituem o aceite humano.

## 2. Ownership dos NO-GO

| ID | DRI | Apoio | Entrega principal |
|---|---|---|---|
| `NG-01` | Codex | CC lista dependências técnicas | decisões, acessos e responsáveis |
| `NG-02` | Codex | — | tenant por subdomínio |
| `NG-03` | Codex | CC valida fronteira API | BFF e CORS seguro |
| `NG-04` | Codex | CC congela slug na API | URLs produtivas e slug estável |
| `NG-05` | CC | Codex valida envs dos fronts | fail-fast de configuração |
| `NG-06` | CC | Codex valida UI/fluxo | credencial de dispositivo e impressão |
| `NG-07` | CC | — | liveness/readiness reais |
| `NG-08` | CC | Codex conecta os fronts | Sentry, alertas e PII scrubbing |
| `NG-09` | Codex | CC fornece origins/telemetria | CSP enforcement, HSTS e headers |
| `NG-10` | CC | — | Neon, roles, RLS e restore 30 dias |
| `NG-11` | CC | — | Redis produtivo e cross-instance |
| `NG-12` | CC | Codex consome URL técnica | Fly produtiva e rollback |
| `NG-13` | CC | Codex testa upload pelo backoffice | R2 produtivo e domínio de assets |
| `NG-14` | Codex | CC valida e-mail/API | Vercel, site, e-mail e legal |
| `NG-15` | Codex | CC opera backend/infra no teste | dry run e sign-off final |

Um DRI responde pela conclusão e evidência do item, mesmo quando há contribuição da outra trilha.

## 3. Fronteiras de arquivos

### Exclusivos do Codex

- `apps/storefront/**`;
- `apps/site/**`;
- `apps/backoffice/**`, exceto impressão;
- configurações Vercel dos três fronts;
- `docs/13-plano-go-live-producao-cabanhas.md`;
- `docs/14-plano-zero-no-go.md`;
- este documento e matriz central de evidências.

### Exclusivos do CC

- `apps/api/**`;
- `apps/api/fly.toml` e configuração produtiva Fly;
- `apps/print-agent/**`;
- `packages/db/**`;
- `packages/contracts/**` para contratos backend/impressão;
- `apps/backoffice/app/gestor/impressao/**`;
- `apps/backoffice/lib/printing-api*`;
- migrations e scripts seguros de verificação do banco.

### Arquivos compartilhados controlados

| Arquivo/área | Regra |
|---|---|
| `pnpm-lock.yaml` | evitar dependências novas; se inevitável, CC integra primeiro e Codex regenera após rebase |
| package root/Turbo | somente Codex altera, após combinar o contrato com CC |
| workflows CI | somente Codex altera; CC fornece os comandos necessários |
| plano/matriz central | somente Codex edita; CC entrega evidência em handoff separado |
| backoffice de impressão | somente CC edita; Codex apenas revisa/testa pelo comportamento público |

Nenhum agente edita arquivo pertencente à outra trilha sem mensagem explícita de handoff.

## 4. Contratos de integração congelados antes dos PRs

### BFF/API

- browser chama apenas rotas same-origin da storefront;
- proxy encaminha apenas allowlist de `/v1/store/*`;
- namespace admin/plataforma nunca é proxyado;
- API mantém CORS credenciado somente para `https://app.molho.live`;
- variável server-only acordada: `MOLHO_API_INTERNAL_URL`;
- timeout, tamanho máximo e headers permitidos ficam cobertos por teste.

### Domínios

- site: `https://molho.live`;
- backoffice: `https://app.molho.live`;
- API: `https://api.molho.live`;
- Cabanhas: `https://cabanhas-bbq.molho.live`;
- assets: `r2.dev` público no piloto por exceção explícita do PM em `NG-01`; domínio
  próprio separado fica pós-piloto;
- Vercel recebe o domínio explícito do Cabanhas; não há wildcard neste piloto.

### Banco

- `DATABASE_URL`: pooled, papel `app_runtime`, somente runtime;
- `DIRECT_URL`: direta, papel `app_migrator`, somente migration job;
- projeto/branch produtivos ficam em `aws-sa-east-1`;
- nenhuma cópia ou seed de staging;
- Neon Free com histórico curto aceito; retenção de 30 dias será coberta por `pg_dump`
  noturno no R2, com restore drill e RPO/RTO registrados.

### Impressão

- dispositivo tenant-scoped;
- segredo exibido uma vez e persistido somente em hash;
- escopo exclusivo de impressão;
- revogação e rotação auditáveis;
- nenhum token de staff fixo;
- URL da API obrigatória, sem default de staging.

## 5. Ondas paralelas

### Onda 0 — desbloqueio

**Codex / R0**

- fechar checklist humano de `NG-01`;
- criar matriz de nomes de recursos e variáveis, sem valores;
- confirmar contratos da seção 4;
- registrar quem pode aprovar cada gate.

**CC / C0**

- confirmar todos os acessos técnicos necessários;
- listar migrations e recursos externos que serão criados;
- entregar desenho curto da credencial de impressão;
- não editar código até os contratos da seção 4 estarem fechados.

**Saída:** `ZG-0` verde.

### Onda 1 — fundações em paralelo

**Codex / R1 — `NG-02` + parte frontend de `NG-04`**

- host routing e rewrite;
- links, canonical, OG, sitemap e manifest;
- URLs do site/backoffice;
- remover defaults para staging/`vercel.app` nos fronts;
- unitários e build dos fronts.

**CC / C1 — `NG-05` + parte backend de `NG-04`**

- schema de configuração da API;
- proibir adapters mock/memória em produção;
- validar roles/URLs e ausência de staging;
- congelar slug publicado na camada de domínio/API;
- testes negativos de startup e slug.

**Integração:** R1 pode ser mergeado antes de C1. Codex rebasa e roda gate completo após ambos.

### Onda 2 — fluxo público e impressão

**Codex / R2 — `NG-03`**

- BFF allowlisted;
- clientes browser same-origin;
- negativas de admin/path traversal/cookies;
- E2E catálogo → checkout → tracking.

**CC / C2 — `NG-06`**

- contratos e migration do dispositivo;
- API de pareamento, rotação e revogação;
- autenticação do consumidor de impressão;
- agente sem token de staff e sem URL de staging;
- testes API/agente e idempotência.

**Integração:** CC revisa o contrato de segurança do BFF; Codex revisa o comportamento público de pareamento sem editar os arquivos reservados.

### Onda 3 — operação e segurança

**Codex / R3 — parte frontend de `NG-08` + `NG-09`**

- Sentry/release nos três fronts;
- CSP report collection em staging;
- correção das violações e enforcement;
- headers finais e plano de HSTS;
- E2E com CSP ativo.

**CC / C3 — `NG-07` + `NG-08`**

- `/health` e `/ready`;
- checks Fly;
- Sentry API e PII scrubbing;
- alertas para 5xx, checkout, stream, impressão e dependências;
- monitoramento e teste de alerta.

**Integração:** C3 é mergeado antes da finalização de R3 para que Codex use as origins e a telemetria definitivas.

### Onda 4 — infraestrutura produtiva sem DNS público

**Codex / R4 — parte técnica de `NG-14`**

- criar projetos Vercel produtivos;
- configurar envs dos fronts;
- gerar builds imutáveis sem domínio ativo;
- testar pelas URLs técnicas;
- preparar promoção e rollback;
- preparar site, `www`, e-mail e pacote para revisão jurídica.

**CC / C4 — `NG-10` + `NG-13`**

- Neon, roles, migrations, RLS e restore;
- R2, credencial, domínio de assets, CORS e smoke de upload.

**CC / C5 — `NG-12` + `NG-11`**

- Fly produtiva com duas máquinas em `gru`;
- Upstash produtivo em São Paulo;
- secrets, readiness e graceful shutdown;
- cross-instance, restart e rollback;
- preparar certificado da API sem apontar DNS.

**Integração:** CC entrega URL `fly.dev` e origin de assets ao Codex; Codex gera um novo RC dos fronts com essas origins antes de congelar o SHA.

### Onda 5 — consolidação e dry run

**Codex / R5 — `NG-14` + `NG-15`**

- confirmar e-mail e aceite jurídico;
- provisionar Cabanhas pelo fluxo real;
- importar e conferir dados aprovados;
- coordenar o teste físico completo;
- consolidar 15/15 evidências;
- conduzir `ZG-1` a `ZG-5`.

**CC / suporte C6**

- acompanhar API, banco, Redis, R2 e impressão;
- provar restore, cross-instance, alertas e revogação do agente;
- corrigir somente incidentes de sua trilha;
- entregar relatório técnico sanitizado.

Nenhum dos dois aponta DNS ou habilita `channel.storefront` nesta onda. Isso pertence ao plano de publicação depois de `ZG-5`.

## 6. Ordem de merge

| Ordem | Entrega | Condição |
|---|---|---|
| 1 | `R1` | testes storefront/site/backoffice verdes |
| 2 | `C1` | startup fail-fast e slug tests verdes |
| 3 | `R2` | E2E BFF positivo e negativo verde |
| 4 | `C2` | migration e impressão automatizada verdes |
| 5 | `C3` | readiness/Sentry/alertas verdes |
| 6 | `R3` | CSP enforcement e fronts verdes |
| 7 | `C4` | restore e storage smoke verdes |
| 8 | `C5` | Fly/Redis/cross-instance/rollback verdes |
| 9 | `R4` | RC Vercel pronto e revertível |
| 10 | `R5` | dry run, evidências e sign-off |

Entregas independentes podem abrir PR simultaneamente, mas entram nessa ordem para reduzir rebases e tornar o SHA candidato reproduzível.

## 7. Estratégia de branches e worktrees

- Codex trabalha em `codex/no-go-front-release`;
- CC trabalha em `cc/no-go-backend-infra`;
- cada agente usa worktree próprio;
- Codex mantém `codex/zero-no-go-integration` como branch de integração;
- CC nunca faz merge direto na integração;
- Codex integra somente PRs com handoff e evidência;
- não executar builds Next simultâneos no mesmo worktree;
- não compartilhar `.env.local` entre worktrees;
- nenhum segredo entra em commit, diff, issue ou mensagem.

**Estado real em 10/09/2026:** as mudanças R0–R4 foram consolidadas em dois commits Codex
anteriores a este registro pós-gate
e rebaseadas sobre `main@efbc266`, que já incorpora C1/C2 e os ajustes posteriores de
impressão. Os arquivos exclusivos do CC foram preservados; os únicos conflitos foram os
documentos `14` e `15`, resolvidos mantendo as decisões da `main` e este handoff Codex. Os
gates obrigatórios de lint/test/build foram repetidos na árvore integrada; o scanner e os
requisitos externos de produção ainda bloqueiam o RC.

Se ambos precisarem alterar `pnpm-lock.yaml`, C1/C2 entra primeiro; Codex rebasa, reaplica sua dependência e regenera o lockfile uma única vez.

## 8. Handoff obrigatório por entrega

Cada entrega R*/C* deve informar:

```text
Entrega:
Branch / SHA:
NO-GO cobertos:
Arquivos alterados:
Migrations:
Variáveis novas (nomes, sem valores):
Comandos executados e resultado:
Evidências:
Riscos restantes:
Rollback:
Próximo ponto de integração:
```

CC registra evidência em `docs/go-live/evidencias-cc.md` ou mensagem de handoff. Somente Codex marca a matriz central de `docs/14-plano-zero-no-go.md`.

## 9. Gates de qualidade

Cada PR roda seus testes focados. A branch de integração, após cada onda, roda:

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter api test:e2e
```

Antes de `ZG-5`, executar também:

- E2E browser completo nos hosts técnicos;
- teste de isolamento tenant A/B;
- teste físico de impressão por 60 minutos;
- cross-instance Redis/SSE;
- restore Neon;
- rollback Vercel e Fly;
- teste de alertas e scrubbing;
- varredura por URLs/credenciais de staging.

## 10. Quadro de acompanhamento

| Entrega | DRI | Depende de | Estado inicial |
|---|---|---|---|
| `R0` | Codex | humanos | amarelo: decisões/acessos registrados; jurídico e operador pendentes |
| `C0` | CC | acessos | concluído e documentado em `docs/go-live/evidencias-cc.md` |
| `R1` | Codex | contrato de domínios | código + testes locais concluídos; RC pendente |
| `C1` | CC | contrato de config/slug | config fail-fast + readiness incorporados à `main`; validação em produção pendente |
| `R2` | Codex | `R1` | BFF + 3 E2E browser locais verdes; integração API pendente |
| `C2` | CC | desenho de impressão | credencial de dispositivo e agente incorporados à `main`; URL de staging no comando e teste físico pendentes |
| `C3` | CC | `C1` | readiness incorporada; Sentry API, alertas reais e observação pendentes |
| `R3` | Codex | `R1`, `C3` | código CSP/Sentry concluído; observação real pendente |
| `C4` | CC | `C1`, acessos | Neon/RLS provisionados; backup/restore drill e R2 smoke pendentes |
| `C5` | CC | `C3`, `C4` | Fly prod com 2 máquinas/health verde e URL técnica entregues; cross-instance/restart/rollback pendentes |
| `R4` | Codex | `R2`, `R3`, URL de `C5` | projetos/Node prontos; envs e RC bloqueados por C4/C5/Sentry |
| `R5` | Codex | todas as anteriores | checklist pronto; dry run e gates humanos pendentes |

Nota de nomenclatura: `docs/go-live/evidencias-cc.md` também chamou de “C3” a entrega de
numeração sequencial e duas vias de comanda. Isso não substitui o C3 deste plano, cujo
escopo continua sendo readiness, Sentry da API, scrubbing e alertas.

### 10.1 Handoff da execução Codex — 10/09/2026

Este bloco é o resumo autocontido para o CC saber exatamente o que já foi entregue na
trilha pública. A evidência detalhada permanece em `docs/go-live/evidencias-codex.md`.

#### Snapshot Git e integração

| Item | Estado |
|---|---|
| Branch Codex | `codex/no-go-front-release`, baseada em `main@efbc266`; o candidato testado tinha dois commits Codex no topo |
| `main` local/remota | `efbc266` (`origin/main`) |
| Divergência após integração | **0 commits atrás e 2 commits à frente** antes dos gates/deploy |
| CC na `main` | C1/C2, migrations, dispositivo de impressão, agente, staging, número de pedido e duas vias já mergeados |
| Branch de integração | `codex/zero-no-go-integration` ainda não foi criada |
| Integração | rebase executado; resolução restrita aos docs `14` e `15` |

Nos arquivos exclusivos de API/Prisma/contratos/agente/impressão prevaleceu a `main`/CC.
As mudanças Codex de storefront/site/configuração dos fronts foram reaplicadas sobre essa
base; os documentos compartilhados foram consolidados semanticamente.

#### R0 — decisões, acessos e coordenação (`NG-01`)

- decisões de slug, domínio, guest, pagamentos, Neon/backup, assets, impressão, dry run e
  plantão registradas em `docs/go-live/ata-ng-01.md`;
- contratos de BFF/API, domínios, banco e impressão consolidados em
  `docs/go-live/contratos-cc.md`;
- matriz central atualizada em `docs/14-plano-zero-no-go.md`;
- jurídico, operador e aceite do Cabanhas continuam como gates humanos;
- nenhum DNS foi apontado e `channel.storefront` não foi publicado.

#### R1 — host routing e URLs (`NG-02`, frontend de `NG-04`)

- parser estrito de authority e slug em `apps/storefront/lib/host-routing.ts`;
- reserva de `www`, `app`, `api`, `staging` e `staging-app`;
- storefront resolve tenant por `<slug>.molho.live`, com path mode somente local e host
  técnico amarrado a `MOLHO_STOREFRONT_TECHNICAL_SLUG`;
- middleware confia em `x-forwarded-host` somente dentro da Vercel, injeta headers internos
  de tenant/base pública e faz rewrite interno sem expor `/{slug}`;
- navegação de catálogo, carrinho, conta e tracking usa URLs públicas limpas;
- canonical, Open Graph, manifest, sitemap e robots usam o host público correto;
- site e backoffice rejeitam URLs HTTP, staging e `vercel.app` no deployment produtivo;
- backoffice exibe/copia `https://<slug>.molho.live` na configuração e no signup;
- unitários de routing, URLs, metadata e navegação adicionados.

#### R2 — BFF público (`NG-03`)

- catch-all same-origin `apps/storefront/app/api/store/[...segments]/route.ts`;
- allowlist explícita por método/rota somente para `/v1/store/*`; admin, plataforma,
  traversal, query inesperada e tenant cruzado são rejeitados antes do upstream;
- `Cookie` e `Authorization` recebidos do browser nunca são propagados;
- sessão do cliente usa header dedicado e só vira Bearer nas rotas permitidas;
- body somente JSON, limitado a 256 KiB; streams sem `Content-Length` são interrompidos
  assim que excedem o teto;
- timeout de 8 s, redirect manual, headers de resposta allowlisted e erro 502 uniforme;
- IP só vem de `x-vercel-forwarded-for` quando `VERCEL=1` e contém um único IP válido;
- browser clients migrados para o BFF same-origin; SSR usa `MOLHO_API_INTERNAL_URL`;
- checkout E2E segue a decisão `checkout.guest=off`: OTP obrigatório antes do pedido;
- handoff CC pendente: validar a contagem real de proxies Vercel → Fly e
  `TRUSTED_PROXY_HOPS` no RC.

#### R3 — CSP, Sentry e privacidade (`NG-09`, frontend de `NG-08`)

- gerador compartilhado de headers em `apps/front-security.ts` aplicado aos três fronts;
- CSP em enforcement por padrão; report-only exige opt-in explícito;
- origins exatas, sem `https:`, `ws:` ou `wss:` genéricos; `unsafe-eval` só em dev;
- HSTS exige `MOLHO_ENABLE_HSTS=true`; `includeSubDomains` exige decisão separada;
- `/api/csp-report` nos três fronts, limite 16 KiB, persistindo somente directive e
  origins sanitizadas;
- scrubber Sentry compartilhado remove telefone, e-mail, JWT, Bearer, cookie, OTP, token,
  endereço, body e query; `sendDefaultPii=false` nos nove configs;
- release Sentry usa SHA; analytics não captura URL completa nem token de tracking e não
  faz autocapture;
- observação no RC, DSNs reais, alertas e ativação de HSTS após TLS continuam pendentes.

#### R4 — Vercel e preparação do RC (`NG-14`)

Operações externas já executadas no escopo `vinigehlens-projects`:

| Projeto | ID | Root | Node | Estado |
|---|---|---|---|---|
| `molho-site` | `prj_zLsTStjMPMF1thOSIMjuYEwNE4Xa` | `apps/site` | `22.x` | existente; Node alinhado |
| `molho-backoffice-prod` | `prj_wIPYqwJEXxNhtkEZS9DvFh25AnCG` | `apps/backoffice` | `22.x` | criado; env da API técnica gravada |
| `molho-storefront-prod` | `prj_r6HYUawAZGy0TD3kiVLgOeCJ3JqW` | `apps/storefront` | `22.x` | criado; env da API técnica gravada |

- inventário de domínios/envs em `docs/go-live/inventario-fronts-producao.md`;
- release/rollback em `docs/go-live/runbook-release-fronts.md`;
- `scripts/verify-front-release.mjs` exige `.next/BUILD_ID` e procura endpoints proibidos
  e a credencial legada de staff nos artefatos;
- somente os envs da API técnica foram gravados em Production; nenhum deployment,
  domínio, alias ou DNS foi criado/alterado;
- nenhum deployment Vercel dos projetos produtivos existe ainda;
- os deploys de staging registrados pelo CC (API v43 e backoffice staging) não incluem as
  mudanças desta branch Codex;
- faltam origin R2, DSNs Sentry, e-mail validado e jurídico antes de gerar o RC com
  `vercel deploy --prebuilt --prod --skip-domain`.

A auditoria direta de Production em 10/09/2026 confirmou inicialmente:

- `molho-storefront-prod`: zero variáveis;
- `molho-backoffice-prod`: zero variáveis;
- `molho-site`: somente `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_APP_URL`.

Depois do handoff da URL técnica, foram gravadas em Production:

- storefront: `MOLHO_API_INTERNAL_URL=https://molho-api.fly.dev`;
- backoffice: `NEXT_PUBLIC_API_URL=https://molho-api.fly.dev`.

A URL respondeu `/ready` com HTTP 200, banco e Redis `ok`; `fly status` confirmou duas
máquinas `started` em `gru`, ambas com 2/2 checks passando. O certificado de
`api.molho.live` continua `Not verified` sem DNS, conforme a proibição até `ZG-5`.
O deploy Vercel segue interrompido antes do build porque os demais envs ausentes violam o
fail-fast e não produziriam um RC válido.

O scanner foi repetido no build integrado. Ele encontrou dois artefatos do backoffice com
`api.staging.molho.live`, vindos de
`apps/backoffice/app/gestor/impressao/printer-settings.tsx`. A credencial legada
`MOLHO_STAFF_ACCESS_TOKEN` não aparece mais: a `main` usa
`MOLHO_PRINT_DEVICE_TOKEN`. Durante o gate apareceu no workspace uma mudança externa,
não commitada, que troca a URL pela produção; ela foi preservada e aguarda handoff C2.

#### R5 — dry run (`NG-15`)

- checklist criado em `docs/go-live/checklist-dry-run-cabanhas.md`;
- jornada cobre Wi-Fi/4G, catálogo, checkout OTP, tracking, gestor, WhatsApp, impressão por
  60 min, restart, reconexão, isolamento A/B, logs sem PII e fallback;
- tenant real, importação aprovada, teste físico e sign-offs ainda não foram executados;
- data-alvo registrada: 11/09/2026, sujeita à disponibilidade do restaurante.

#### Variáveis introduzidas ou formalizadas pelos fronts

- storefront: `MOLHO_API_INTERNAL_URL`, `MOLHO_STOREFRONT_ROOT_DOMAIN`,
  `MOLHO_STOREFRONT_PATH_MODE`, `MOLHO_STOREFRONT_TECHNICAL_SLUG`,
  `MOLHO_STOREFRONT_PUBLIC_URL`, `MOLHO_ASSETS_ORIGIN`;
- site/backoffice: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_APP_URL`, `NEXT_PUBLIC_API_URL`;
- segurança/observabilidade: `MOLHO_CSP_REPORT_ONLY`, `MOLHO_ENABLE_HSTS`,
  `MOLHO_HSTS_INCLUDE_SUBDOMAINS`, `NEXT_PUBLIC_SENTRY_*`, `SENTRY_*`,
  `NEXT_PUBLIC_POSTHOG_KEY`, `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA_ID`.

Somente nomes e exemplos sem credenciais foram adicionados a `.env.example`.

#### Gates executados na árvore Codex antes da integração

| Comando | Resultado |
|---|---|
| `pnpm lint` | verde |
| `pnpm test` | verde, Turbo 9/9; storefront 199, backoffice 249, API unit 737, contracts 404, UI 227, DB 35, print-agent 19 |
| `pnpm build` | verde, Turbo 7/7 em checkout isolado |
| storefront typecheck | verde |
| `pnpm --filter @molho/storefront test:e2e` | 3/3 verde: fluxo OTP/tracking, negativas BFF e CSP report |
| `pnpm --filter api test:e2e` | não conclusivo localmente: Redis em `localhost:6379` indisponível; 16 arquivos falharam por timeout, 2 passaram |
| `pnpm verify:front-release` | vermelho no build integral pelos valores de impressão descritos acima |
| `git diff --check` | verde |

O E2E da API do CC prova separadamente o fluxo do dispositivo de impressão contra staging,
mas o gate integral deve ser repetido na árvore integrada com Redis disponível.

#### Gates repetidos depois da integração

| Comando | Resultado |
|---|---|
| `pnpm lint` | verde |
| `pnpm test` | verde, Turbo 9/9; storefront 199, backoffice 246, API unit 779, contracts 404, UI 227, DB 35, print-agent 31 |
| `pnpm build` | verde, Turbo 7/7 em worktree isolado de `e0ac726` |
| `pnpm verify:front-release` | vermelho somente por `api.staging.molho.live` em 2 artefatos do backoffice |

O Playwright da storefront continua com a evidência isolada de 3/3 verde anterior à
integração. O E2E integral da API e o Playwright contra o RC continuam obrigatórios;
não foram declarados verdes por inferência.

#### Rollback e próximo ponto de integração

- não há deployment produtivo para reverter; os projetos Vercel continuam vazios;
- o rollback de código é reverter os dois commits Codex no topo de `main@efbc266`;
- próximo passo obrigatório: incorporar o handoff C2 da URL, configurar os envs de
  Production, repetir scanner/API E2E/storefront E2E e então gerar o RC;
- somente com C4/C5, jurídico e e-mail prontos deve ser criado o RC técnico sem domínio;
- promoção, DNS e publicação do tenant permanecem proibidos até `ZG-5` 15/15 verde.

## 11. Caminho crítico esperado

O caminho crítico provável é:

```text
NG-01 → C1/config → C3/readiness → C4/Neon → C5/Fly+Redis
      → R4/RC Vercel → C2/R5 impressão física → ZG-5
```

Codex concluiu roteamento, BFF, URLs e CSP enquanto CC percorre esse caminho. A URL
técnica da API já foi entregue; a espera atual do RC é pela origin de assets, Sentry e
demais gates registrados em R4/R5.

Referência de capacidade, não compromisso de prazo:

- ondas 0–1: 1–3 dias úteis;
- ondas 2–3: 3–5 dias úteis;
- onda 4: 2–3 dias úteis;
- onda 5: 1–2 dias úteis e disponibilidade do Cabanhas;
- total provável: 7–10 dias úteis com acessos e aprovações disponíveis.

Não reduzir testes, restore, jurídico ou dry run para recuperar atraso.

## 12. Prompt do CC

> Você é o DRI da trilha backend/infra do Plano Zero NO-GO. Leia integralmente `AGENTS.md`, `docs/01-plano-produto.md`, `docs/02-definicoes-v1.md`, `docs/03-self-setup.md`, `docs/07-aprendizados.md`, `docs/14-plano-zero-no-go.md` e `docs/15-divisao-zero-no-go-codex-cc.md`. Trabalhe somente nos pacotes C0–C6 e respeite o ownership de arquivos. Comece por C0/C1; contratos e Prisma precedem API e agente. Não edite storefront/site nem a matriz central, não use seed em produção, não reutilize recursos de staging e não exponha segredos. Entregue cada pacote com o template da seção 8 e pare se faltar decisão, acesso ou gate humano. Não aponte DNS nem publique `channel.storefront`.

## 13. Prompt do Codex

> Atue como release captain e DRI da trilha pública do Plano Zero NO-GO. Execute R0–R5 em `docs/15-divisao-zero-no-go-codex-cc.md`, mantenha a matriz central e integre os handoffs do CC na ordem da seção 6. Não edite API, Prisma, contratos ou agente de impressão; combine interfaces antes dos PRs. Faça roteamento, BFF, URLs, fronts, CSP, Vercel, coordenação humana e dry run. Rode os gates completos após cada onda. Não aponte DNS nem publique o tenant antes de `ZG-5` 15/15 verde.
