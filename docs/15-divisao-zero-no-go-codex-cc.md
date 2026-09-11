# Divisão paralela — Zero NO-GO entre Codex e CC

**Data-base:** 09/09/2026
**Última atualização Codex:** 11/09/2026
**Plano mestre:** `docs/14-plano-zero-no-go.md`
**Publicação:** `docs/13-plano-go-live-producao-cabanhas.md`
**Objetivo:** executar `NG-01` a `NG-15` no menor caminho crítico possível, com exatamente duas trilhas técnicas e sem conflito de arquivos.
**Prioridade operacional de 11/09/2026:** colocar no ar o sistema completo do Cabanhas
hoje — cardápio para clientes, checkout, balcão/pedidos/gestão, WhatsApp, impressão e
fallback. O site institucional `molho.live`/`www` não é prioridade desta janela.

## 1. Papéis

### Codex — release captain e produto público

Responsável por:

- storefront e resolução de tenant por domínio;
- BFF público e E2E de navegador;
- storefront Cabanhas, backoffice, URLs, metadata e headers dos fronts;
- configuração e telemetria dos fronts;
- projetos Vercel e release candidate dos fronts;
- coordenação de decisões, jurídico, Cabanhas e matriz de evidências;
- integração final, dry run e GO/NO-GO.

### CC — backend, dados e runtime

Responsável por:

- API, contratos e Prisma;
- configuração fail-fast do backend;
- credencial e operação do agente de impressão;
- readiness, fallback operacional, scrubbing e alertas técnicos futuros;
- Neon, Upstash Redis, R2 e Fly.io;
- migrations, restore, cross-instance e rollback da API;
- suporte técnico ao dry run.

### Gates humanos

Alguns resultados não podem ser autoaprovados por nenhum agente:

- PM decide slug, checkout guest, pagamentos, backup/plano e domínio de assets;
- Cabanhas aprova dados, cardápio, PIX, operação e teste físico;
- responsável técnico autoriza o corte e assume o plantão.

O PM assumiu `NG-01` em 11/09/2026. Juridico/Sentry completos ficam pós-piloto se ainda
não estiverem fechados; não bloqueiam o corte operacional do Cabanhas. Os agentes preparam
e coletam evidências, mas não substituem o aceite humano do PM/Cabanhas no `NG-15`.

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
| `NG-08` | CC | Codex conecta os fronts | backlog futuro: Sentry/alertas completos pós-piloto |
| `NG-09` | Codex | CC fornece origins/telemetria | CSP enforcement, HSTS e headers |
| `NG-10` | CC | — | Neon, roles, RLS e restore 30 dias |
| `NG-11` | CC | — | Redis produtivo e cross-instance |
| `NG-12` | CC | Codex consome URL técnica | Fly produtiva e rollback |
| `NG-13` | CC | Codex testa upload pelo backoffice | R2 produtivo e domínio de assets |
| `NG-14` | Codex | CC valida e-mail/API | Vercel e domínios operacionais do Cabanhas |
| `NG-15` | Codex | CC opera backend/infra no teste | sistema operacional completo e sign-off final |

Um DRI responde pela conclusão e evidência do item, mesmo quando há contribuição da outra trilha.

## 3. Plano CC — corte operacional Cabanhas hoje

Este bloco substitui a leitura antiga de “Zero NO-GO perfeito” por uma janela objetiva de
produção assistida do restaurante. A meta não é lançar o institucional do Molho; é deixar o
Cabanhas operando com o Molho em produção.

### Escopo que entra hoje

- loja pública `https://cabanhas-bbq.molho.live`;
- backoffice/gestão em `https://app.molho.live`;
- API produtiva Fly, preferencialmente também validada em `https://api.molho.live`;
- cardápio real aprovado, preços, disponibilidade, horários, zonas, mínimo e pagamentos;
- checkout com OTP, PIX estático/dinheiro/cartão na entrega;
- balcão/pedidos/gestão: fila, detalhe, mudança de status e acompanhamento;
- WhatsApp click-to-chat humano;
- impressão real e fallback operacional;
- evidências sanitizadas e sign-off PM/Cabanhas/técnico.

### Fora do caminho crítico de hoje

- site institucional `molho.live` e `www`;
- marketing/CTA público do Molho;
- domínio próprio de assets;
- Sentry/API e suite completa de alertas (`NG-08`) — backlog futuro aprovado pelo PM;
- melhorias não necessárias para operar o primeiro restaurante.

### Ordem executável

1. Atualizar `origin/main`, confirmar CI verde e RCs técnicos READY.
2. Marcar `NG-01` como verde por aceite do PM e `NG-08` como backlog futuro nos docs de
   evidência.
3. Criar/promover os domínios operacionais:
   - `cabanhas-bbq.molho.live` → `molho-storefront-prod`;
   - `app.molho.live` → `molho-backoffice-prod`;
   - `api.molho.live` → Fly `molho-api`, se o certificado validar a tempo; caso contrário,
     manter a API técnica `https://molho-api.fly.dev` no runtime já implantado e registrar
     a pendência do alias final.
4. Validar TLS e headers finais nos domínios operacionais.
5. Provisionar o tenant Cabanhas pelo fluxo real; não copiar seed, cliente, sessão, pedido
   ou auditoria de staging.
6. Conferir dados operacionais:
   - CNPJ/endereço/coordenadas;
   - cardápio, complementos, preços em centavos e disponibilidade;
   - horários, zonas, taxas e mínimo;
   - PIX/instruções e formas de pagamento aceitas;
   - módulos ativos por `entitled AND enabled AND released`.
7. Publicar `channel.storefront` somente depois do pré-voo do domínio e dados.
8. Executar dry run assistido usando `docs/go-live/checklist-dry-run-cabanhas.md`.
9. Se passar, registrar sign-off e marcar `NG-02/03/04/09/14/15` conforme evidência; se
   falhar, manter NO-GO pontual com causa objetiva e rollback.

### Critérios mínimos para GO operacional

- cliente abre `https://cabanhas-bbq.molho.live` em Wi‑Fi e 4G;
- checkout cria pedido real de teste com OTP;
- pedido aparece no gestor em até 3 s;
- operador consegue aceitar/mudar status no backoffice;
- WhatsApp abre o contato correto;
- ticket imprime uma vez;
- recuperação funciona após restart/rede/impressora;
- logs/evidências não expõem PII;
- rollback Vercel/Fly identificado e pronto;
- PM, técnico e operador Cabanhas assinam GO.

## 4. Fronteiras de arquivos

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

## 5. Contratos de integração congelados antes dos PRs

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

## 6. Ondas paralelas

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

## 7. Ordem de merge

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

## 8. Estratégia de branches e worktrees

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

## 9. Handoff obrigatório por entrega

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

## 10. Gates de qualidade

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

## 11. Quadro de acompanhamento

| Entrega | DRI | Depende de | Estado (10/09/2026) |
|---|---|---|---|
| `R0` | Codex | humanos | amarelo: decisões/acessos registrados; jurídico e operador pendentes |
| `C0` | CC | acessos | ✅ concluído e documentado em `docs/go-live/evidencias-cc.md` |
| `R1` | Codex | contrato de domínios | código + testes locais concluídos; RC pendente |
| `C1` | CC | contrato de config/slug | ✅ config fail-fast + readiness validados no boot real da Fly prod (`NG-05`, `NG-07`) |
| `R2` | Codex | `R1` | BFF + 3 E2E browser locais verdes; integração API pendente |
| `C2` | CC | desenho de impressão | credencial, agente e remoção da URL de staging integrados; teste físico (60 min) fica no dry run |
| `C3` | CC | `C1` | readiness ✅; Sentry da API **descopado no piloto** (ata NG-01 §1 linha 12); alerta via fallback `fly logs` + uptime ping no `/ready` |
| `R3` | Codex | `R1`, `C3` | código CSP/Sentry concluído; observação real pendente |
| `C4` | CC | `C1`, acessos | ✅ Neon prod (49 migrations, RLS), R2 prod (smoke PUT/GET/public/backup), backup noturno verde + restore drill 17s (RPO ≤ 24h, RTO ~2min) — `NG-10`, `NG-13` |
| `C5` | CC | `C3`, `C4` | ✅ Fly prod `molho-api.fly.dev` (2×`gru`, 2/2), Upstash prod (`redis:ok`), restart drill OK — `NG-11`, `NG-12`. Fan-out A/B e rollback real ficam no dry run |
| `R4` | Codex | `R2`, `R3`, URL de `C5` | projetos/API/assets prontos; RC bloqueado por jurídico + e-mail + gates humanos |
| `R5` | Codex | todas as anteriores | checklist pronto; dry run e gates humanos pendentes |

Trilha CC encerrada em 10/09/2026: `NG-05`, `NG-07`, `NG-10`, `NG-11`, `NG-12`,
`NG-13` verdes; `NG-08` (parte API) descopado no piloto. Evidência e handoff pro
Codex em `docs/go-live/evidencias-cc.md`.

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

Atualização posterior: `cc/no-go-backend-infra@748574e` foi incorporada pela merge
commit `ba6d3b6`, preservando os três commits e a autoria do CC. O workflow de backup foi
adicionado em `7d99098`; o ajuste de lint do smoke R2 e esta documentação vieram depois.

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
- observação no RC, DSNs reais, alertas e ativação de HSTS após TLS continuam pendentes;
  sem DSN, Sentry não bloqueia mais o RC técnico do piloto conforme descope registrado em
  `docs/go-live/ata-ng-01.md` §1 linha 12.

#### R4 — Vercel e preparação do RC (`NG-14`)

Operações externas já executadas no escopo `vinigehlens-projects`:

| Projeto | ID | Root | Node | Estado |
|---|---|---|---|---|
| `molho-site` | `prj_zLsTStjMPMF1thOSIMjuYEwNE4Xa` | `apps/site` | `22.x` | RC técnico READY |
| `molho-backoffice-prod` | `prj_wIPYqwJEXxNhtkEZS9DvFh25AnCG` | `apps/backoffice` | `22.x` | RC técnico READY |
| `molho-storefront-prod` | `prj_r6HYUawAZGy0TD3kiVLgOeCJ3JqW` | `apps/storefront` | `22.x` | RC técnico READY |

- inventário de domínios/envs em `docs/go-live/inventario-fronts-producao.md`;
- release/rollback em `docs/go-live/runbook-release-fronts.md`;
- `scripts/verify-front-release.mjs` exige `.next/BUILD_ID` e procura endpoints proibidos
  e a credencial legada de staff nos artefatos;
- envs de routing, API técnica e assets foram gravados em Production; valores inicialmente
  criados vazios pelo CLI foram sobrescritos com `vercel env add --value --force`;
- deployments técnicos foram criados sem domínio customizado e com Deployment Protection;
- os deploys de staging registrados pelo CC (API v43 e backoffice staging) não incluem as
  mudanças desta branch Codex;
- faltam apenas registro de e-mail/jurídico e os gates humanos para promoção pública; o RC
  técnico pode ser gerado sem DSN Sentry no piloto com `vercel deploy --prebuilt --prod
  --skip-domain`.

A auditoria direta de Production em 10/09/2026 confirmou inicialmente:

- `molho-storefront-prod`: zero variáveis;
- `molho-backoffice-prod`: zero variáveis;
- `molho-site`: somente `NEXT_PUBLIC_SITE_URL` e `NEXT_PUBLIC_APP_URL`.

Depois do handoff da URL técnica, foram gravadas em Production:

- storefront: `MOLHO_API_INTERNAL_URL=https://molho-api.fly.dev`, root domain, path mode,
  slug técnico e `MOLHO_ASSETS_ORIGIN`;
- backoffice: `NEXT_PUBLIC_API_URL=https://molho-api.fly.dev` e
  `MOLHO_ASSETS_ORIGIN`.

A URL respondeu `/ready` com HTTP 200, banco e Redis `ok`; `fly status` confirmou duas
máquinas `started` em `gru`, ambas com 2/2 checks passando. O certificado de
`api.molho.live` continua `Not verified` sem DNS, conforme a proibição até `ZG-5`.
O deploy Vercel deixou de ser bloqueado por DSN Sentry ausente no piloto; a integração de
Sentry permanece pronta para quando os DSNs forem configurados, mas o RC técnico pode ser
emitido usando API `fly.dev` e origin R2.

RC técnico inicial emitido em 11/09/2026 a partir de `main@55de6b1`:

| App | URL técnica | Deployment |
|---|---|---|
| storefront | `https://molho-storefront-prod-k8n8uiqux-vinigehlens-projects.vercel.app` | `dpl_39M5Pr79jGgAuV7LF2bBmAeSesWG` |
| backoffice | `https://molho-backoffice-prod-9tq778c8n-vinigehlens-projects.vercel.app` | `dpl_CFzAdv9XzM4wXTLZGfHFq4M3ZhnR` |
| site | `https://molho-site-1uui6nkts-vinigehlens-projects.vercel.app` | `dpl_2L9zm1sgh8JrTpTDXTzXXPc9EGyk` |

Validação via `vercel curl` autenticado: storefront `/` HTTP 200, backoffice `/login`
HTTP 200, site `/` HTTP 200, headers CSP/defensivos presentes. Acesso público direto
continua protegido por SSO; `molho.live`, `app.molho.live` e
`cabanhas-bbq.molho.live` seguem sem DNS/alias até `ZG-5`.

Ao redeployar depois do merge, o build remoto da Vercel falhou uma vez no storefront
porque o Turbo não repassava as envs do projeto para `next build` (`MOLHO_API_INTERNAL_URL`
chegava vazia no `next.config.ts`). O PR #73 (`1d20f96`) corrigiu `turbo.json`, declarando
as envs de build dos fronts. Depois disso, o build remoto passou e o RC técnico foi
reemitido em 11/09/2026 a partir de `main@1d20f96`:

| App | URL técnica | Deployment |
|---|---|---|
| storefront | `https://molho-storefront-prod-4kh9wk2pk-vinigehlens-projects.vercel.app` | `dpl_DX8ayUXhPXBXm6kce8Tjv6XwX75x` |
| backoffice | `https://molho-backoffice-prod-4k131l9py-vinigehlens-projects.vercel.app` | `dpl_4NikxrWBLcKRMrpq8KnarL8WojBZ` |
| site | `https://molho-site-ahb1yatb5-vinigehlens-projects.vercel.app` | `dpl_6afsu2sBEqwwG5A7HashJHKF5A6t` |

Validação do RC final: storefront `/` HTTP 200; backoffice `/login` HTTP 200; site `/`
HTTP 200; rota administrativa proibida via BFF
`/api/store/cabanhas-bbq/admin/orders` HTTP 404; CSP e headers defensivos presentes nos
três fronts; `GET https://molho-api.fly.dev/ready` HTTP 200 com `db=ok` e `redis=ok`.

O merge do CC incorporou a troca da URL de impressão para `api.molho.live`. O scanner foi
repetido depois do merge e examinou 428 artefatos: zero endpoint proibido e nenhuma
ocorrência da credencial legada `MOLHO_STAFF_ACCESS_TOKEN`.

Para `NG-10`, `.github/workflows/pg-backup.yml` agenda `scripts/pg-backup.sh` diariamente
às 06:17 UTC, com disparo manual, container PostgreSQL 18, concorrência única e timeout
de 30 minutos. Os quatro Actions secrets do handoff foram configurados sem registrar
valores. A trilha CC registrou backup verde no 3º disparo e restore drill em ~17 s.

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

Depois do merge `ba6d3b6` e do workflow `7d99098`, os gates foram novamente executados:

| Comando | Resultado |
|---|---|
| `pnpm lint` | verde após declarar o `fetch` global do Node no smoke R2 |
| `pnpm test` | verde, Turbo 9/9; 1.921 testes |
| `pnpm build` | verde, Turbo 7/7 |
| `pnpm verify:front-release` | verde, 428 artefatos e zero endpoint proibido |
| `pnpm --filter @molho/storefront test:e2e` | verde, 3/3 na árvore integrada |

Depois do descope de Sentry no piloto e do commit `54d9e37`:

| Comando | Resultado |
|---|---|
| `pnpm --filter @molho/storefront test -- front-security.test.ts` | verde; storefront 200 testes |
| `pnpm lint` | verde |
| `pnpm test` | verde, Turbo 10/10 |
| `pnpm build` | verde, Turbo 7/7 |
| `pnpm verify:front-release` | verde, 409 artefatos e zero endpoint proibido |
| GitHub CI em `main@55de6b1` | verde; CI + React Doctor |
| `pnpm build` com envs públicas do RC após PR #73 | verde, Turbo 7/7 |
| GitHub PR #73 | merged em `main@1d20f96`; React Doctor verde; `quality` passou lint/typecheck/test/build/storybook e estava no contraste no momento do merge; Worker externo `molho-uploads` falhou fora de escopo |

#### Rollback e próximo ponto de integração

- há RC técnico Vercel READY nos três fronts; rollback de frontend pode ser feito pela
  Vercel para o deployment anterior de cada projeto ou por revert dos commits `54d9e37`
  e `1d20f96`;
- próximo passo obrigatório: validar o RC com navegador/Playwright protegido, registrar
  aceite jurídico/e-mail e manter DSNs Sentry como pós-piloto/pendência de observabilidade;
- somente com C4/C5, jurídico e e-mail prontos deve ser criado o RC técnico sem domínio;
- promoção, DNS e publicação do tenant permanecem proibidos até `ZG-5` 15/15 verde.

## 11.1 Plano de execução imediato — janela de 5 horas (11/09/2026)

**Meta única:** sistema operacional completo do Cabanhas (cardápio clientes + checkout +
balcão/pedidos/gestão) em produção em até 5 horas a partir de agora. Site institucional
`molho.live` não é prioridade desta janela — RC técnico já READY basta, sem mais trabalho
nele hoje.

`main` atual: `ee0276a`. `NG-01` verde por aceite do PM. `NG-08` é backlog futuro/pós-piloto
e não bloqueia. Nenhuma feature nova — só corte, validação e evidência. Não publicar
`channel.storefront` antes do dry run e do GO final.

RCs técnicos prontos:
- Storefront: `https://molho-storefront-prod-4kh9wk2pk-vinigehlens-projects.vercel.app`
- Backoffice: `https://molho-backoffice-prod-4k131l9py-vinigehlens-projects.vercel.app`
- Site: `https://molho-site-ahb1yatb5-vinigehlens-projects.vercel.app`
- API técnica: `https://molho-api.fly.dev`

### Fase 0 — preflight (~15 min)

1. atualizar local para `origin/main`; `git status` limpo;
2. `curl https://molho-api.fly.dev/ready` → esperado `db=ok`, `redis=ok`;
3. confirmar os três deployments Vercel acima como READY;
4. registrar em `docs/go-live/evidencias-cc.md` que `NG-01` foi aceito pelo PM e `NG-08`
   virou backlog futuro.

### Fase 1 — NG-14 domínios e DNS (~60 min, inclui espera de certificado)

Apontar somente os domínios do sistema operacional:

- `app.molho.live` → `molho-backoffice-prod`;
- `cabanhas-bbq.molho.live` → `molho-storefront-prod`;
- `api.molho.live` → Fly `molho-api` (validar instrução exata com
  `fly certs show api.molho.live -a molho-api` antes de criar/editar registro).

`molho.live`/`www` (site institucional) ficam fora desta janela — não apontar hoje.

DNS via `CNAME` para Vercel nos subdomínios; sem wildcard. Esperar certificados válidos e
`api.molho.live` sair de `Not verified`.

**Aceite:** `https://app.molho.live/login`, `https://cabanhas-bbq.molho.live` e
`https://api.molho.live/ready` (`db=ok`, `redis=ok`) respondem.

### Fase 2 — NG-02 tenant por subdomínio (~20 min)

- `curl -I https://cabanhas-bbq.molho.live` resolve tenant `cabanhas-bbq`;
- URL pública sem `/{slug}`; canonical/OG/manifest/sitemap apontam para o host final;
- `app`, `api`, `www`, `staging` não resolvem como tenant.

### Fase 3 — NG-03 BFF e CORS final (~20 min)

- browser chama storefront same-origin, não API direta;
- `/api/store/cabanhas-bbq/admin/orders` → 404/403;
- admin/plataforma não proxyados; traversal/query proibida rejeitada; cookies/Authorization
  do browser não repassados;
- `TRUSTED_PROXY_HOPS`/IP real Vercel → Fly no rate limit;
- CORS da API libera só `https://app.molho.live`.

### Fase 4 — NG-04 URLs produtivas e slug estável (~15 min)

- backoffice copia/exibe `https://cabanhas-bbq.molho.live`;
- nenhum bundle aponta `api.staging`, `staging-app`, `localhost`;
- slug `cabanhas-bbq` imutável; `pnpm verify:front-release` verde.

### Fase 5 — NG-09 CSP, HSTS e headers finais (~15 min)

`curl -I` em `https://app.molho.live/login`, `https://cabanhas-bbq.molho.live`,
`https://api.molho.live/ready`: CSP enforcement sem `https:`/`ws:`/`wss:` genérico, R2
permitido só onde necessário, `connect-src` do backoffice cobre a API final, HSTS após TLS
OK, `x-frame-options`/`x-content-type-options`/`referrer-policy`/`permissions-policy`
presentes.

### Fase 6 — NG-15 tenant real e dry run (~90–120 min)

Seguir `docs/go-live/checklist-dry-run-cabanhas.md`: provisionar tenant real, conferir
cardápio aprovado, configurar PIX estático/dinheiro/cartão na entrega, parear
impressora/agente, manter `channel.storefront` fechado até validação final, rodar jornada
completa em Wi-Fi e 4G (catálogo, carrinho, OTP, checkout, tracking, gestor, WhatsApp
fallback, impressão por 60 min, restart/reconexão, fan-out SSE nas duas máquinas, rollback
drill, logs sem PII), registrar sign-off PM + Cabanhas + técnico.

### Entrega final

Atualizar `docs/14-plano-zero-no-go.md`, este documento, `docs/go-live/evidencias-cc.md`,
`docs/go-live/evidencias-codex.md` (se mexer em fronts) e `docs/go-live/ata-ng-01.md` (se
registrar aceite humano). Resultado esperado: `NG-01/02/03/04/09/14/15` verdes, `NG-08`
backlog futuro, `ZG-5` aprovado — ou, se algo falhar no dry run, manter NO-GO com evidência
objetiva. Site institucional `molho.live` permanece pós-corte, sem trabalho adicional hoje.

## 12. Caminho crítico esperado

O caminho crítico provável é:

```text
NG-01 → C1/config → C3/readiness → C4/Neon → C5/Fly+Redis
      → R4/RC Vercel → C2/R5 impressão física → ZG-5
```

Codex concluiu roteamento, BFF, URLs e CSP enquanto CC percorre esse caminho. A URL
técnica da API e a origin de assets já foram entregues; Sentry está descopado para o
piloto e não bloqueia mais o RC técnico.

Referência de capacidade, não compromisso de prazo:

- ondas 0–1: 1–3 dias úteis;
- ondas 2–3: 3–5 dias úteis;
- onda 4: 2–3 dias úteis;
- onda 5: 1–2 dias úteis e disponibilidade do Cabanhas;
- total provável: 7–10 dias úteis com acessos e aprovações disponíveis.

Não reduzir testes, restore, jurídico ou dry run para recuperar atraso.

## 13. Prompt do CC

> Você é o DRI da trilha backend/infra do Plano Zero NO-GO. Leia integralmente `AGENTS.md`, `docs/01-plano-produto.md`, `docs/02-definicoes-v1.md`, `docs/03-self-setup.md`, `docs/07-aprendizados.md`, `docs/14-plano-zero-no-go.md` e `docs/15-divisao-zero-no-go-codex-cc.md`. Trabalhe somente nos pacotes C0–C6 e respeite o ownership de arquivos. Comece por C0/C1; contratos e Prisma precedem API e agente. Não edite storefront/site nem a matriz central, não use seed em produção, não reutilize recursos de staging e não exponha segredos. Entregue cada pacote com o template da seção 8 e pare se faltar decisão, acesso ou gate humano. Não aponte DNS nem publique `channel.storefront`.

## 14. Prompt do Codex

> Atue como release captain e DRI da trilha pública do Plano Zero NO-GO. Execute R0–R5 em `docs/15-divisao-zero-no-go-codex-cc.md`, mantenha a matriz central e integre os handoffs do CC na ordem da seção 6. Não edite API, Prisma, contratos ou agente de impressão; combine interfaces antes dos PRs. Faça roteamento, BFF, URLs, fronts, CSP, Vercel, coordenação humana e dry run. Rode os gates completos após cada onda. Não aponte DNS nem publique o tenant antes de `ZG-5` 15/15 verde.
