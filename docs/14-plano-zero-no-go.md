# Plano Zero NO-GO — pré-produção Molho + Cabanhas BBQ

**Data-base:** 09/09/2026
**Base auditada:** `main` em `51ff9e6c19bccc38f1f4274a0ba3e23d689285d6`
**Plano de publicação relacionado:** `docs/13-plano-go-live-producao-cabanhas.md`
**Regra atualizada em 11/09/2026:** o corte permitido hoje é o sistema operacional do
Cabanhas — loja pública, backoffice/gestão, API, pedidos e impressão. O site institucional
`molho.live` e `www` não são caminho crítico desta janela e ficam pós-corte.

> A divisão paralela de execução entre Codex e CC está em `docs/15-divisao-zero-no-go-codex-cc.md`. Esse documento define ownership de arquivos e ordem de merge e prevalece em caso de dúvida operacional.

## 1. Objetivo e definição de pronto

Este plano existe para eliminar todos os bloqueios conhecidos antes do go-live, separando correção de produto, infraestrutura, operação e corte.

O sistema estará pronto para publicação quando:

- os 15 pacotes `NG-*` estiverem concluídos com evidência;
- `pnpm lint`, `pnpm test` e `pnpm build` estiverem verdes no mesmo SHA candidato;
- os E2E de API e browser estiverem verdes contra o release candidate;
- produção estiver isolada de staging em banco, Redis, storage, e-mail, chaves e projetos;
- backup restaurável, observabilidade, rollback e impressão física estiverem provados;
- PM e Cabanhas tiverem dado aceite explícito para o piloto operacional;
- o comitê de GO/NO-GO tiver aprovado `ZG-5`.

Não há exceção silenciosa. Um bloqueio só muda para verde com artefato verificável, não com “parece funcionar”.

## 2. Decisões adotadas

Para retirar ambiguidades do executor, este plano adota:

1. **Domínio do piloto:** `cabanhas-bbq.molho.live`, cadastrado explicitamente na Vercel. O wildcard não entra neste lançamento.
2. **Storefront → API:** BFF same-origin limitado a `/v1/store/*`; CORS credenciado da API continua restrito ao backoffice.
3. **Produção:** recursos novos e isolados; nada é promovido ou clonado de staging além do artefato de código aprovado.
4. **Banco:** Neon em `aws-sa-east-1`, runtime pooled como `app_runtime`, migration direta como `app_migrator` e 30 dias de restore habilitados.
5. **Impressão:** credencial de dispositivo revogável e restrita a impressão; token de staff fixo não será aceito.
6. **Assets:** bucket R2 produtivo e origin separada de `molho.live`. A ata `NG-01` registra a exceção explícita do PM para `pub-<hash>.r2.dev` somente no piloto; custom domain próprio fica pós-piloto.
7. **Segurança:** CSP em enforcement no backoffice após observação em staging; adapters mock/memória proibidos em produção.
8. **Cabanhas:** tenant criado pelo fluxo real; nenhum seed, cliente, pedido ou sessão de staging será copiado.
9. **Release:** build imutável validado antes da promoção; migrations somente expansivas nesta janela.
10. **Prioridade de hoje:** publicar e validar o sistema operacional completo do Cabanhas
    (`cardápio clientes → checkout → balcão/pedidos/gestão → WhatsApp/impressão/fallback`).
    O institucional `molho.live`, `www`, marketing e revisão jurídica ampla não bloqueiam
    este piloto operacional.
11. **Observabilidade:** `NG-08` fica backlog futuro/pós-piloto. No piloto, o aceite é
    operar com fallback documentado: `/ready`, logs Fly, métricas da plataforma e canal de
    incidente.

Escolha de DNS: cadastrar o subdomínio do Cabanhas explicitamente é o caminho mais simples para o piloto porque mantém a Cloudflare como DNS autoritativo; wildcard da Vercel exige o método de nameservers.

## 3. Sequência e dependências

```text
ZG-0 Decisões humanas
  ├── Trilha A: domínio/BFF/URLs/slug
  ├── Trilha B: config/readiness/segurança/observabilidade
  ├── Trilha C: autenticação do agente de impressão
  └── Trilha D: contas, jurídico e dados do Cabanhas
              ↓
ZG-1 Código e contratos verdes
              ↓
ZG-2 Infra produtiva pronta, ainda sem DNS público
              ↓
ZG-3 Release candidate + migrations + restore/rollback provados
              ↓
ZG-4 Dry run físico completo no Cabanhas
              ↓
ZG-5 Comitê GO/NO-GO
              ↓
Plano de publicação e corte do documento 13
```

As trilhas A–D podem avançar em paralelo depois de `ZG-0`, mas cada PR deve conter um único pacote coerente e seus testes.

## 4. Gates

| Gate | Condição de saída | Quem aprova |
|---|---|---|
| `ZG-0` | todas as decisões, contas e responsáveis definidos | PM + técnico + Cabanhas |
| `ZG-1` | código completo, revisão e suíte obrigatória verde | técnico |
| `ZG-2` | infra isolada, secrets validados, deploys técnicos saudáveis | técnico |
| `ZG-3` | RC, migration, restore, rollback, alertas e segurança provados | técnico + plantonista |
| `ZG-4` | pedido físico ponta a ponta no restaurante | técnico + Cabanhas |
| `ZG-5` | checklist final 100%, jurídico e negócio aprovados | PM + técnico + jurídico + Cabanhas |

## 5. Backlog para zerar os NO-GO

### NG-01 — fechar decisões e acessos

**Resolve:** decisões pendentes, ausência de responsáveis e bloqueios externos.

**Entradas obrigatórias:**

- [x] confirmar o slug final `cabanhas-bbq`;
- [x] confirmar uso de `cabanhas-bbq.molho.live`, sem domínio próprio no piloto;
- [x] decidir `checkout.guest` ligado ou desligado;
- [x] confirmar PIX estático e/ou pagamento na entrega;
- [x] escolher e registrar a origin separada de assets (exceção PM `r2.dev` documentada);
- [x] decidir Neon Free + `pg_dump` noturno com retenção de 30 dias;
- [ ] nomear responsável técnico, jurídico e operador do Cabanhas;
- [x] definir canal de incidente e fallback por WhatsApp;
- [x] fornecer acesso administrativo a Vercel, Fly, Neon, Upstash, Cloudflare, R2, Resend e Sentry;
- [ ] definir data do dry run e do primeiro serviço assistido.

**Aceite:** ata curta com decisões, responsáveis e data, sem segredos.
**Dependência:** nenhuma.
**Desbloqueia:** todos os demais pacotes.

### NG-02 — roteamento real por subdomínio

**Resolve:** storefront presa a `/{slug}`.

**Áreas prováveis:**

- `apps/storefront/middleware.ts`;
- `apps/storefront/app/[slug]/**`;
- `apps/storefront/lib/site-url.ts`;
- `apps/storefront/app/sitemap.ts`;
- `apps/storefront/app/robots.ts`;
- rotas de manifest e Open Graph.

**Implementação:**

- [ ] extrair slug de `Host` e, somente atrás do proxy confiável, `X-Forwarded-Host`;
- [ ] remover porta, normalizar lowercase e rejeitar hostname inválido;
- [ ] reconhecer `<slug>.molho.live` em produção;
- [ ] reservar `www`, `app`, `api`, `staging`, `staging-app` e hosts técnicos;
- [ ] fazer rewrite interno para a árvore `[slug]`, sem expor o slug no path;
- [ ] preservar path mode somente para localhost/teste, controlado por ambiente;
- [ ] garantir rotas profundas, refresh, 404 de tenant e tracking;
- [ ] gerar canonical, OG, sitemap e manifest absolutos no host público.

**Testes mínimos:** parser de host, porta, host malicioso, reserved host, tenant inexistente, rota profunda, metadata e manifest.

**Aceite:** a loja inteira funciona em um host de subdomínio de staging/preview e nenhuma URL pública inclui `/{slug}`.
**Dependência:** `NG-01`.

### NG-03 — BFF público da storefront e fronteira CORS

**Resolve:** checkout bloqueado por CORS e risco de liberar cookies administrativos a subdomínios públicos.

**Áreas prováveis:**

- `apps/storefront/lib/*-api.ts`;
- nova rota/rewrite server-side em `apps/storefront/app/api/**` ou configuração equivalente;
- `apps/api/src/main.ts`;
- testes Playwright/E2E de storefront.

**Implementação:**

- [ ] criar endpoint same-origin que aceite somente rotas necessárias de `/v1/store/*`;
- [ ] representar a allowlist como código explícito, sem proxy aberto por prefixo arbitrário;
- [ ] proibir `/v1/admin/*`, `/v1/platform/*`, stream administrativo e paths codificados/traversal;
- [ ] não encaminhar cookies do backoffice, `Authorization` ou headers hop-by-hop;
- [ ] encaminhar somente método, body e headers públicos necessários;
- [ ] definir timeout, limite de body e tratamento uniforme de erro;
- [ ] usar uma variável server-only para `https://api.molho.live`;
- [ ] trocar clientes browser para URL relativa same-origin;
- [ ] manter `MOLHO_CORS_ORIGINS=https://app.molho.live` na API;
- [ ] preservar IP confiável para rate limit sem aceitar `X-Forwarded-For` arbitrário.

**Testes mínimos:** catálogo, delivery-match, OTP/guest, checkout, tracking, payload grande, timeout e negativas para admin/path traversal/cookie forwarding.

**Aceite:** fluxo completo funciona em browser real; chamada administrativa pela storefront é impossível; preflight administrativo aceita apenas o backoffice.
**Dependência:** `NG-02`.

### NG-04 — URLs produtivas, CTA e slug imutável

**Resolve:** site enviando para staging, URLs `vercel.app` e mudança destrutiva do slug.

**Áreas prováveis:**

- `apps/site/lib/urls.ts`;
- `apps/backoffice/app/gestor/configuracao/page.tsx`;
- fluxo de onboarding/signup;
- service/repository que atualiza nome e slug do tenant;
- testes associados.

**Implementação:**

- [ ] remover defaults produtivos para staging ou `vercel.app`;
- [ ] exigir `NEXT_PUBLIC_APP_URL` e URLs públicas no build de produção;
- [ ] exibir/copiar `https://<slug>.molho.live` no backoffice;
- [ ] gerar slug apenas antes da publicação;
- [ ] impedir mudança automática do slug quando `onboardedAt`/publicação estiver definido;
- [ ] manter alteração de nome sem alterar endereço público;
- [ ] adicionar canonical para `molho.live` e redirect de `www` preparado;
- [ ] varrer bundle/config por strings `staging` e `vercel.app`.

**Aceite:** renomear o restaurante não muda o slug; build produtivo falha sem URLs; busca no artefato não encontra endpoints de staging.
**Dependência:** `NG-01`.

### NG-05 — configuração fail-fast de produção

**Resolve:** Redis em memória, storage mock, chaves ausentes e erro somente no primeiro pedido/login.

**Áreas prováveis:**

- bootstrap/config de `apps/api/src`;
- `apps/api/src/storage/storage.module.ts`;
- auth/token/OTP/Redis bootstrap;
- `apps/*/next.config.ts` e instrumentação.

**Implementação:**

- [ ] criar schemas de ambiente por app;
- [ ] em produção, exigir DB, Redis, R2, Resend, Sentry, chaves de cifra/hash/JWT e origins;
- [ ] proibir `MockStorageProvider` e stores em memória em produção;
- [ ] validar que `DATABASE_URL` é pooled e usa `app_runtime`;
- [ ] manter `DIRECT_URL` fora do runtime normal da API;
- [ ] rejeitar URL produtiva contendo `staging`, `localhost`, `vercel.app` ou `r2.dev`;
- [ ] exigir HTTPS onde aplicável;
- [ ] garantir que `MOLHO_DEBUG_PUBSUB` esteja falso;
- [ ] apresentar erro com nome da variável, nunca com seu valor.

**Testes mínimos:** matriz de variável ausente/inválida, adapter mock, Redis ausente, papéis Neon trocados e URL de staging.

**Aceite:** processo produtivo inválido termina antes de abrir a porta; configuração correta sobe sem exibir segredo.
**Dependência:** `NG-01`.

### NG-06 — credencial segura do agente de impressão

**Resolve:** token de staff expira em 15 minutos e agente aponta para staging.

**Ordem obrigatória:** contratos → Prisma/migration → API → agente → UI de pareamento → testes.

**Modelo mínimo:**

- [ ] tabela tenant-scoped para dispositivo com UUID v7, `tenant_id`, nome, `token_hash`, `version`, `last_seen_at`, `revoked_at`, `created_by`, timestamps e soft delete quando aplicável;
- [ ] RLS, FK/índice composto iniciado por `tenant_id` e auditoria;
- [ ] segredo mostrado apenas uma vez no pareamento e guardado somente em hash no banco;
- [ ] credencial com escopo exclusivo de consumir/confirmar jobs de impressão;
- [ ] revogação e rotação sem afetar sessões de staff;
- [ ] `@RequireModule('printing.escpos')` e permissionamento correto nas rotas de gestão;
- [ ] nenhuma autorização baseada diretamente em role;
- [ ] URL da API obrigatória no agente, sem default de staging;
- [ ] reconexão, backoff e estado “credencial revogada” acionável;
- [ ] idempotência para impedir reimpressão após reconnect.

**Testes mínimos:** emissão, uso, expiração/rotação, revogação, tenant cruzado, módulo desligado, job duplicado, restart e segredo não logado.

**Aceite:** agente imprime durante teste contínuo de 60 minutos, reconecta após restart, não duplica ticket e para imediatamente ao revogar o dispositivo.
**Dependência:** `NG-01`.

### NG-07 — readiness e saúde de dependências

**Resolve:** `/health` verde mesmo com DB/Redis indisponíveis.

**Áreas prováveis:** `apps/api/src/health/**` e `apps/api/fly.toml`.

**Implementação:**

- [ ] manter `/health` como liveness sem I/O externo;
- [ ] criar `/ready` com query DB e Redis ping independentes;
- [ ] aplicar timeout curto por dependência e resposta sem detalhes secretos;
- [ ] retornar não-2xx se uma dependência obrigatória falhar;
- [ ] configurar Fly service check em `/ready` e machine/liveness check separado;
- [ ] confirmar que readiness não usa tenant request context de forma incorreta;
- [ ] medir latência do check e evitar pool exhaustion.

**Testes mínimos:** tudo saudável, DB off, Redis off, timeout e recuperação.

**Aceite:** Fly remove máquina não pronta da rotação e mantém processo vivo quando somente readiness falha.
**Dependência:** `NG-05`.

### NG-08 — Sentry, alertas e privacidade de logs

**Resolve:** falhas invisíveis e risco de PII em telemetria.

**Implementação:**

- [ ] criar projetos/ambientes Sentry para API, backoffice, storefront e site;
- [ ] configurar DSN, environment e release SHA nas plataformas;
- [ ] filtrar telefone, e-mail, endereço, cookies, tokens, OTP e body de checkout;
- [ ] configurar sourcemaps sem publicar segredo;
- [ ] alertar erro de checkout, autenticação, stream, impressão e taxa anormal de 5xx;
- [ ] criar uptime externo para site, storefront, backoffice, `/health` e `/ready`;
- [ ] definir destinatário e escalonamento;
- [ ] documentar dashboard do primeiro serviço.

**Aceite:** erro sintético por app chega ao plantonista, contém release correto e nenhuma PII; falha simulada de readiness dispara alerta.
**Dependência:** `NG-05`, `NG-07`.

### NG-09 — CSP, HSTS e headers finais

**Resolve:** CSP apenas report-only sem coleta e política de transporte incompleta.

**Implementação:**

- [ ] criar endpoint/coletor de reports sem armazenar PII desnecessária;
- [ ] inventariar origins realmente usadas em staging;
- [ ] remover `unsafe-eval` e curingas não necessários;
- [ ] executar jornada completa sob CSP report-only e zerar violações legítimas;
- [ ] ativar `Content-Security-Policy` em enforcement no backoffice;
- [ ] manter regras compatíveis em storefront/site e documentar diferença;
- [ ] validar `frame-ancestors`, `object-src`, `base-uri` e formulários;
- [ ] ativar HSTS somente depois de todos os certificados estarem válidos;
- [ ] decidir `includeSubDomains` considerando tenants e hosts futuros.

**Aceite:** jornada E2E passa com CSP enforcement; headers esperados são confirmados por `curl`; nenhum asset ou Sentry legítimo é bloqueado.
**Dependência:** `NG-02`, `NG-03`, `NG-08`.

### NG-10 — banco produtivo, RLS e restore de 30 dias

**Resolve:** inexistência de banco produtivo e lacuna do NFR de recuperação.

**Implementação:**

- [ ] criar projeto Neon limpo em `aws-sa-east-1`;
- [ ] habilitar janela de restore de 30 dias no plano compatível;
- [ ] proteger a branch produtiva;
- [ ] executar bootstrap como owner;
- [ ] configurar `app_runtime` e `app_migrator` com menor privilégio;
- [ ] gerar URL pooled para runtime e direta para migration;
- [ ] executar `prisma migrate deploy` em runner seguro, sem linha de comando com segredo;
- [ ] conferir ownership das tabelas e todas as políticas RLS;
- [ ] provar fail-closed sem `app.tenant_id`;
- [ ] criar branch/restore isolado e validar integridade;
- [ ] registrar RPO/RTO observados e procedimento de restauração.

**Proibições:** `prisma migrate dev`, seed do Cabanhas, cópia de staging e down migration destrutiva.

**Aceite:** restore drill aprovado; runtime não consegue migrar; migrator não é usado pela API; RLS A/B e fail-closed verdes.
**Dependência:** `NG-01`, `NG-05`.

### NG-11 — Redis produtivo e prova cross-instance

**Resolve:** ausência de Redis produtivo e risco de estado divergente nas duas máquinas.

**Implementação:**

- [ ] criar Upstash exclusivo em São Paulo;
- [ ] usar TLS e credencial exclusiva;
- [ ] validar sessão, refresh lookup, rate limit e pub/sub;
- [ ] reiniciar uma máquina e comprovar reconexão;
- [ ] confirmar que não existe fallback para memória em produção;
- [ ] configurar alerta de indisponibilidade/latência.

**Aceite:** pedido criado via máquina A aparece no gestor conectado à B; sessão e rate limit permanecem coerentes após restart.
**Dependência:** `NG-05`, `NG-12`.

### NG-12 — API Fly produtiva isolada

**Resolve:** inexistência do app `molho-api`.

**Implementação:**

- [ ] parametrizar ou criar configuração produtiva sem alterar o app de staging;
- [ ] criar `molho-api` em `gru`;
- [ ] manter duas máquinas sempre ligadas e rolling deploy;
- [ ] injetar secrets produtivos no secret store;
- [ ] configurar graceful shutdown e fechamento SSE com `server_shutdown`;
- [ ] configurar checks `/health` e `/ready`;
- [ ] publicar primeiro em `molho-api.fly.dev`;
- [ ] executar smoke, restart de uma máquina e logs;
- [ ] registrar imagem/release anterior para rollback;
- [ ] preparar certificado de `api.molho.live` sem apontar DNS.

**Aceite:** duas máquinas healthy em `gru`, readiness verde, cross-instance provado e rollback de imagem ensaiado em staging.
**Dependência:** `NG-05`, `NG-07`, `NG-10`.

### NG-13 — storage R2 produtivo e domínio de assets

**Resolve:** uso de `r2.dev` e compartilhamento de storage com staging.

**Implementação:**

- [x] registrar a origin de assets aprovada na ata `NG-01` (`r2.dev` no piloto; custom domain pós-piloto);
- [ ] criar bucket produtivo;
- [ ] criar credencial com menor privilégio e rotação documentada;
- [x] registrar a exceção PM ao custom domain para o piloto;
- [ ] restringir CORS de upload ao backoffice;
- [ ] validar tipo/tamanho de arquivo no servidor;
- [ ] definir cache, invalidação e remoção;
- [ ] garantir que uploads públicos não recebam cookies da aplicação;
- [ ] remover defaults `r2.dev` da configuração produtiva.

**Aceite:** upload presignado, leitura, cache, substituição, remoção e rejeição de arquivo inválido passam na origin final aprovada na ata.
**Dependência:** `NG-01`, `NG-05`.

### NG-14 — Vercel, domínios operacionais e corte do Cabanhas

**Resolve:** fronts produtivos operacionais, CTA/URLs sem staging e domínio final da loja
do Cabanhas. O site institucional `molho.live`, `www` e revisão ampla jurídico-marketing
ficam pós-corte e não bloqueiam a operação do restaurante hoje.

**Infra/fronts:**

- [ ] criar `molho-backoffice-prod` com root `apps/backoffice`;
- [ ] criar `molho-storefront-prod` com root `apps/storefront`;
- [ ] alinhar runtime Node com a versão aprovada no CI;
- [ ] configurar Production envs e Sentry;
- [ ] gerar build produtivo imutável sem associar domínio;
- [ ] validar pelas URLs técnicas;
- [ ] preparar `app.molho.live` e `cabanhas-bbq.molho.live` no painel;
- [ ] deixar `www → molho.live` e novo institucional fora do caminho crítico de hoje;
- [ ] registrar deployment para promoção e rollback.

**E-mail/legal operacional:**

- [ ] confirmar Resend como Verified e testar OTP em Gmail/Outlook;
- [ ] verificar SPF, DKIM, return-path e DMARC no dashboard;
- [ ] confirmar canal de suporte/incidente do piloto;
- [ ] manter termos/privacidade atuais sem bloquear o piloto, com revisão ampla pós-corte
  se ainda não houver assinatura final;
- [ ] enviar e responder mensagem externa de teste.

**Aceite:** builds técnicos verdes e revertíveis; nenhum bundle aponta a staging; OTP
entrega; `app.molho.live` e `cabanhas-bbq.molho.live` funcionam; canal operacional recebe.
**Dependência:** `NG-04`, `NG-09`, entradas humanas de `NG-01`. `NG-08` não bloqueia o
piloto e fica backlog futuro.

### NG-15 — tenant Cabanhas, dry run e sign-off

**Resolve:** ausência de dados reais, validação física e aceite operacional do sistema
completo do Cabanhas — cardápio para clientes, checkout, balcão/pedidos, gestão,
WhatsApp, impressão e fallback.

**Provisionamento:**

- [ ] criar tenant pelo onboarding real;
- [ ] criar owner real e validar login;
- [ ] cadastrar CNPJ, endereço e coordenadas aprovados;
- [ ] importar catálogo aprovado e conferir todos os valores em centavos;
- [ ] subir logo/imagens no R2 produtivo;
- [ ] cadastrar horários, zonas, taxas e pedido mínimo;
- [ ] cadastrar PIX/instruções e pagamentos aceitos;
- [ ] ativar módulos pelo estado entitled AND enabled AND released;
- [ ] publicar `channel.storefront` somente após domínio final responder e pré-voo
  operacional passar;
- [ ] não copiar clientes, pedidos, sessões ou auditoria de staging.

**Dry run físico / operação real assistida:**

- [ ] abrir loja em celular real via Wi-Fi e 4G;
- [ ] executar catálogo → carrinho → endereço → pagamento → pedido;
- [ ] confirmar pedido no gestor em menos de 3 segundos;
- [ ] operar balcão/gestão com fila de pedidos, detalhe do pedido e mudança de status;
- [ ] mudar status somente pelo fluxo autorizado;
- [ ] validar WhatsApp click-to-chat;
- [ ] imprimir uma única vez na impressora real;
- [ ] manter agente rodando por 60 minutos;
- [ ] reiniciar uma máquina Fly e derrubar/religar impressora/rede;
- [ ] comprovar polling fallback e recuperação SSE;
- [ ] cancelar pedido de teste sem apagar auditoria;
- [ ] testar isolamento tenant A/B e logs sem PII.

**Aceite:** checklist assinado pelo responsável técnico/PM e pelo operador do Cabanhas;
evidência de pedido, tela do gestor/balcão, ticket físico, canal de incidente e recuperação.
**Dependência:** `NG-02` a `NG-14`.

## 6. Plano de PRs e ordem de execução

| Ordem | Pacote | Conteúdo | Gate local |
|---|---|---|---|
| 1 | PR-A | `NG-02` roteamento + `NG-04` URLs/slug | unit + storefront tests + build |
| 2 | PR-B | `NG-03` BFF e fronteira CORS | integração + browser E2E negativo/positivo |
| 3 | PR-C | `NG-05` config + `NG-07` readiness | unit + API E2E + container startup |
| 4 | PR-D | `NG-06` impressão, migration e agente | unit + API E2E + teste do agente |
| 5 | PR-E | `NG-09` headers + observabilidade mínima operacional (`NG-08` em backlog futuro) | CSP E2E + `/ready`/logs/canal de incidente |
| 6 | Infra-1 | `NG-10`, `NG-11`, `NG-13` | restore + cross-instance + storage smoke |
| 7 | Infra-2 | `NG-12`, `NG-14` | RC técnico + rollback |
| 8 | Operação | `NG-15` | dry run físico e sign-off |

Se um PR ficar grande, dividir por camada mantendo contratos/Prisma antes da API e API antes da UI. Não misturar provisionamento de infraestrutura em PR de feature.

## 7. Testes e evidências obrigatórias

### Gate de código

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter api test:e2e
```

Também executar os E2E separados de storefront/backoffice relevantes ao fluxo completo. O executor deve registrar comando, SHA, horário e resultado.

### Gate de release candidate

- [ ] deployment Vercel inspecionado e READY;
- [ ] deployment Fly com duas máquinas e checks verdes;
- [ ] migrations aplicadas uma vez e registradas;
- [ ] cross-instance SSE/Redis verde;
- [ ] restore Neon verde;
- [ ] rollback Vercel e Fly ensaiados;
- [ ] uptime/fallback operacional entregam alerta; Sentry fica backlog futuro;
- [ ] CSP enforcement verde;
- [ ] nenhuma URL/credencial de staging no runtime produtivo.

### Evidências que não podem conter segredos

- SHA e links/IDs de deployment;
- IDs de release e imagem Fly;
- nomes de migration aplicadas;
- região e nome dos recursos;
- saída sanitizada de health/readiness;
- relatório dos testes;
- screenshot/status de certificados, restore e alertas;
- ticket físico do pedido de teste sem PII desnecessária;
- aprovações com nome, papel e horário.

## 8. Matriz final Zero NO-GO

| ID | Estado atual | Evidência / bloqueio para verde |
|---|---|---|
| `NG-01` | verde | PM assumiu aceite em 11/09/2026; decisões/acessos em `go-live/ata-ng-01.md`; pendências restantes foram movidas para `NG-14`/`NG-15` |
| `NG-02` | amarelo | código + unit/E2E local em `go-live/evidencias-codex.md`; RC técnico Vercel READY; falta DNS/alias final só após ZG-5 |
| `NG-03` | amarelo | BFF + browser E2E verde; negativa real no RC retornou 404; falta validar CORS/hops no domínio final |
| `NG-04` | amarelo | URLs frontend concluídas; API/slug integrados; scanner do RC sem endpoint proibido; falta domínio final |
| `NG-05` | verde | startup fail-fast validado em Fly prod |
| `NG-06` | em execução (CC) | credencial revogável + impressão 60 min |
| `NG-07` | verde | readiness real confirmou DB/Redis e 2/2 checks por máquina |
| `NG-08` | backlog futuro | Sentry/API e alertas completos ficam pós-piloto; piloto opera com fallback aprovado: `/ready`, logs Fly, métricas e canal de incidente |
| `NG-09` | amarelo | enforcement/headers implementados e testados localmente; falta observação no RC e HSTS após TLS |
| `NG-10` | verde | workflow noturno, backup verde e restore drill isolado registrados pela trilha CC |
| `NG-11` | verde | Upstash prod, `redis:ok` e restart drill registrados pela trilha CC; fan-out A/B fica no dry run |
| `NG-12` | verde | API Fly prod `molho-api.fly.dev`, 2 máquinas/ready verdes; cert final Not verified até DNS |
| `NG-13` | verde | R2 na origin aprovada; PUT/GET/public GET/backup bucket/cleanup comprovados |
| `NG-14` | amarelo | RC técnico Vercel READY; foco hoje é `app.molho.live` + `cabanhas-bbq.molho.live`; institucional `molho.live` fica pós-corte |
| `NG-15` | vermelho | checklist preparado; faltam tenant real, operação completa cardápio→pedidos/gestão→impressão e sign-off |

Para o piloto de hoje, `ZG-5` operacional pode ficar verde com `NG-08` formalmente aceito
como backlog futuro e com `NG-02/03/04/09/14/15` verdes no fluxo do Cabanhas.

## 9. Cronograma de referência

Estimativa de caminho crítico, não SLA, assumindo acessos e jurídico disponíveis:

- **Dia 1:** `ZG-0`, desenho final e abertura de PR-A/PR-C;
- **Dias 2–4:** roteamento, BFF, URLs, slug, config e readiness;
- **Dias 3–6:** credencial de impressão, observabilidade e CSP;
- **Dias 5–7:** Neon, Redis, R2, Fly e Vercel produtivos sem DNS público;
- **Dias 7–8:** migration, RC, restore, rollback e segurança;
- **Hoje:** corte operacional do Cabanhas (`app` + storefront + API), provisionamento real
  e dry run assistido;
- **Pós-corte:** institucional `molho.live`/`www`, revisão ampla jurídica/marketing e
  Sentry completo.

Revisão jurídica, aquisição de domínio de assets ou disponibilidade física do restaurante podem alongar o caminho crítico. Não compensar atraso removendo gates.

## 10. Prompt para o agente executor

> Resolva todos os NO-GO seguindo `docs/14-plano-zero-no-go.md`. Comece por `NG-01` e trabalhe pelos PRs da seção 6. Antes de editar, revalide o estado atual e leia `docs/01-plano-produto.md`, `docs/02-definicoes-v1.md`, `docs/03-self-setup.md`, `docs/07-aprendizados.md` e `docs/13-plano-go-live-producao-cabanhas.md`. Mantenha a matriz da seção 8 atualizada com links de evidência. Não publique DNS, não habilite `channel.storefront` e não altere staging durante a remediação. Use contratos/Prisma antes da API e testes junto de cada mudança. Pare e mantenha o gate vermelho se faltar decisão humana, acesso, segredo, revisão jurídica ou teste físico. Só entregue “Zero NO-GO” quando os 15 itens e os gates `ZG-0` a `ZG-5` estiverem comprovadamente verdes.

## 11. Fontes operacionais

- Vercel, domínios e wildcard: <https://vercel.com/docs/domains/working-with-domains/add-a-domain>
- Vercel, promoção de deployment: <https://vercel.com/docs/deployments/promoting-a-deployment>
- Vercel, rollback: <https://vercel.com/docs/cli/rollback>
- Fly.io, custom domains: <https://fly.io/docs/networking/custom-domain/>
- Fly.io, health checks: <https://fly.io/docs/reference/health-checks/>
- Neon, connection pooling: <https://neon.com/docs/connect/connection-pooling>
- Neon, restore: <https://neon.com/docs/introduction/branch-restore>
- Cloudflare R2, custom domains: <https://developers.cloudflare.com/r2/buckets/public-buckets/>
- Resend, verificação de domínio: <https://resend.com/docs/dashboard/domains/introduction>
