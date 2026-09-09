# Plano de go-live — Molho + piloto Cabanhas BBQ

**Data-base:** 09/09/2026
**Commit auditado:** `51ff9e6c19bccc38f1f4274a0ba3e23d689285d6` (`main`)
**Estado:** plano para execução; **NO-GO hoje**
**Objetivo:** publicar o Molho em produção e operar o primeiro tenant piloto, Cabanhas BBQ, sem misturar dados ou credenciais de staging.

> O backlog operacional para eliminar os bloqueios antes desta publicação está em `docs/14-plano-zero-no-go.md`. Nenhuma fase de corte deste documento começa antes de o gate `ZG-5` daquele plano estar verde.

## 1. Resultado esperado

Ao final deste plano:

- `https://molho.live` será o site institucional canônico;
- `https://www.molho.live` redirecionará para `https://molho.live`;
- `https://app.molho.live` será o backoffice de produção;
- `https://api.molho.live` será a API de produção na Fly.io;
- `https://cabanhas-bbq.molho.live` será a loja pública do piloto;
- produção terá Neon, Redis, R2, Sentry e credenciais próprios;
- o fluxo completo pedido → gestor → pagamento → impressão terá sido testado no restaurante;
- haverá monitoramento, backup restaurável, rollback e responsáveis de plantão.

Este plano assume que o domínio do Cabanhas é o subdomínio acima. Domínio próprio do restaurante, como `pedidos.cabanhasbbq.com.br`, continua fora do MVP e exige uma decisão de produto e implementação adicional.

## 2. Parecer executivo

O código está com CI verde, mas o sistema **não deve ser publicado ainda**. Os bloqueios mais importantes são:

1. a storefront ainda navega por `/{slug}` e não resolve o tenant pelo host;
2. chamadas de navegador da storefront para a API são bloqueadas pelo CORS atual;
3. `app.molho.live`, `api.molho.live` e `cabanhas-bbq.molho.live` ainda não existem no DNS;
4. não existem projeto produtivo do backoffice nem app produtivo da API;
5. o site público já está online, mas seus CTAs ainda levam para staging;
6. o agente de impressão usa um access token de 15 minutos e está apontado para a API de staging;
7. Sentry não está configurado nas plataformas e `/health` não prova DB/Redis;
8. o e-mail de contato legal não tem recebimento comprovado;
9. o requisito de 30 dias de recuperação do banco não está coberto automaticamente no plano Neon mais simples;
10. o endpoint público `r2.dev` previsto nos documentos não é adequado para produção;
11. o slug do tenant pode mudar ao editar o nome, quebrando domínio e links;
12. páginas legais ainda se declaram pendentes de revisão jurídica.

## 3. Decisões de arquitetura para o piloto

Há dois caminhos razoáveis para os subdomínios de lojas:

- delegar o DNS autoritativo para a Vercel e usar `*.molho.live`;
- manter o DNS na Cloudflare e cadastrar explicitamente cada domínio de tenant na Vercel.

Para o piloto, usar o segundo caminho: cadastrar somente `cabanhas-bbq.molho.live`. É a menor mudança segura e preserva o DNS atual. Wildcard fica como decisão antes do onboarding self-service em escala, pois a Vercel exige seu método de nameservers para wildcard.

Arquitetura escolhida:

| Componente | Produção | Observação |
|---|---|---|
| Site | projeto Vercel atual `molho-site` | corrigir CTA, canonical e redirecionamento de `www` |
| Backoffice | novo projeto Vercel `molho-backoffice-prod` | domínio `app.molho.live` |
| Storefront | novo projeto Vercel `molho-storefront-prod` | domínio explícito `cabanhas-bbq.molho.live` no piloto |
| API | novo app Fly `molho-api`, região `gru` | duas máquinas sempre ligadas, rolling deploy |
| Banco | novo projeto Neon de produção | `aws-sa-east-1`, sem cópia de staging |
| Redis | nova instância Upstash de produção | São Paulo, nunca compartilhar com staging |
| Arquivos | novo bucket R2 de produção | domínio público em registrable domain separado de `molho.live` |
| E-mail | Resend | domínio verificado e teste real de entrega |

O navegador da storefront usará um BFF/proxy same-origin restrito a `/v1/store/*`. A API continuará aceitando CORS credenciado somente de `https://app.molho.live`. Isso evita expor endpoints administrativos e o cookie de stream a qualquer subdomínio público de tenant.

## 4. Estado encontrado em 09/09/2026

| Item | Estado atual | Impacto |
|---|---|---|
| CI do `main` | verde no commit auditado | base de código aprovada pelo gate atual |
| `molho.live` | HTTP 200 na Vercel | já é público |
| `www.molho.live` | HTTP 200, sem redirect | conteúdo duplicado e canonical indefinido |
| CTA do site | aponta para `staging-app.molho.live` | usuário real entra em staging |
| `app.molho.live` | não resolve | backoffice indisponível |
| `api.molho.live` | não resolve | API indisponível |
| `cabanhas-bbq.molho.live` | não resolve | loja indisponível |
| Backoffice Vercel | existe somente projeto de staging | produção ausente |
| Storefront Vercel | projeto atual usa `staging.molho.live` | separar produção |
| Fly | existe somente `molho-api-staging` | produção ausente |
| Staging API | duas máquinas saudáveis em `gru` | arquitetura foi provada em staging |
| CORS storefront | preflight sem `Access-Control-Allow-Origin` | checkout no browser não funciona cross-origin |
| Sentry | código existe; DSNs produtivos ausentes | falhas não chegam ao plantão |
| Health check | apenas liveness estática | não detecta indisponibilidade de DB/Redis |
| CSP | somente report-only, sem coletor constatado | não bloqueia nem gera telemetria útil |
| R2 | plano usa `r2.dev` | endpoint de desenvolvimento, sujeito a rate limit |
| Impressão | URL de staging e token de 15 min | impressão automática para após expiração |
| Contato legal | `contato@molho.live`, sem MX no domínio | canal pode não receber mensagens |

## 5. Riscos e tratamento obrigatório

### P0 — bloqueiam o go-live

#### R1. Tenant por subdomínio não está implementado

**Evidência:** o middleware da storefront resolve slug pela URL e os links internos usam `/${slug}`.
**Risco:** `cabanhas-bbq.molho.live` não encontra a loja ou continua gerando URLs erradas.
**Tratamento:** implementar resolução por `Host`, rewrite interno para `[slug]`, rotas profundas e metadata absoluta. Adicionar lista de hosts reservados (`www`, `app`, `api`, `staging`, `staging-app`).
**Gate:** todos os links, carrinho, checkout, acompanhamento, manifest, canonical e OG funcionam sem prefixo público de slug.

#### R2. CORS atual impede o checkout e ampliar o allowlist é inseguro

**Evidência:** o preflight da storefront de staging para a API de staging não recebe ACAO; a API usa cookie credenciado para o stream administrativo.
**Risco:** checkout falha no navegador; liberar todos os subdomínios amplia a superfície dos endpoints administrativos.
**Tratamento:** criar BFF/proxy same-origin na storefront somente para `/v1/store/*`; não encaminhar cookies administrativos; nunca fazer proxy de `/v1/admin/*`. Manter `MOLHO_CORS_ORIGINS=https://app.molho.live` na API.
**Gate:** Playwright real comprova catálogo, entrega, OTP/guest e criação de pedido; tentativa de acessar namespace admin pela storefront é negada.

#### R3. Infraestrutura produtiva não existe

**Risco:** domínio pode apontar acidentalmente para staging ou publicação ocorrer sem isolamento.
**Tratamento:** criar recursos produtivos separados conforme a seção 3. Recusar qualquer segredo ou URL contendo `staging` na configuração produtiva.
**Gate:** inventário de recursos, IDs, regiões e URLs registrado sem valores secretos.

#### R4. Dependências críticas degradam silenciosamente

**Evidência:** Redis pode cair para memória por processo; storage pode cair para mock; algumas chaves são validadas apenas no primeiro uso.
**Risco:** sessão, rate limit e pub/sub quebram entre máquinas; uploads aparentam sucesso sem persistência; autenticação falha após publicação.
**Tratamento:** validação central de ambiente no startup em produção. Redis, storage, chaves de criptografia, pepper, JWT, Resend, URLs e Sentry devem causar falha imediata se ausentes ou inconsistentes. Proibir adapters mock em `NODE_ENV=production`.
**Gate:** testes de configuração negativa e startup bem-sucedido com conjunto produtivo completo.

#### R5. Impressão automática expira em 15 minutos

**Evidência:** o agente recebe `MOLHO_STAFF_ACCESS_TOKEN`, enquanto o access token tem TTL de 15 minutos; sua URL padrão está em staging.
**Risco:** pedidos deixam de imprimir durante o serviço sem recuperação automática.
**Tratamento recomendado:** implementar credencial de dispositivo longa, revogável, com hash no banco, escopo exclusivo de impressão, pairing, auditoria e rotação. Tornar a URL da API obrigatória.
**Alternativa de piloto:** declarar impressão manual pelo browser como fallback formal e retirar “impressão automática” do critério de prontidão.
**Gate:** teste físico contínuo por pelo menos 60 minutos, incluindo reconexão, expiração/rotação, duplicidade e impressora desligada.

#### R6. Não há detecção operacional confiável

**Risco:** o primeiro sinal de falha será o restaurante.
**Tratamento:** configurar Sentry por app e ambiente, release por commit, scrubbing de PII, monitor externo e alertas. Criar `/ready` que verifique DB e Redis com timeout curto; manter `/health` como liveness.
**Gate:** erro sintético chega ao plantonista e monitor detecta queda de DB/Redis.

#### R7. Site público conduz usuários a staging

**Tratamento:** preparar `NEXT_PUBLIC_APP_URL=https://app.molho.live`, mas publicar a troca somente depois do smoke final do backoffice. Redirecionar `www` para o apex e emitir canonical de `https://molho.live`.
**Gate:** nenhum link público contém `staging` ou `vercel.app`.

#### R8. Slug mutável quebra o endereço do restaurante

**Tratamento:** congelar slug após publicação/onboarding; editar nome não altera slug. Mudança posterior deve ser operação explícita, auditada e acompanhada de redirect.
**Gate:** teste comprova que renomear Cabanhas não muda `cabanhas-bbq`.

#### R9. Legal e canal de contato incompletos

**Evidência:** termos e privacidade declaram revisão jurídica pendente; `molho.live` não tem recebimento MX comprovado.
**Tratamento:** revisão jurídica, identificação correta da empresa/controladores, DPA, subprocessadores, retenção e resposta a incidente. Criar e testar caixa real para `contato@molho.live` ou alterar todas as páginas para um endereço funcional.
**Gate:** jurídico/PM aprovam versão publicada e uma mensagem externa recebe resposta.

#### R10. Backup não atende automaticamente aos 30 dias definidos

**Risco:** a retenção do plano do provedor pode ser inferior ao NFR de 30 dias.
**Tratamento:** escolher antes da compra:

- Neon Scale com 30 dias de restore; ou
- plano inferior mais backup lógico diário, cifrado, em destino separado, retenção de 30 dias e restore testado.

Não reduzir o NFR silenciosamente.
**Gate:** restaurar uma cópia em ambiente isolado e validar contagem, RLS e integridade de um pedido.

#### R11. Arquivos públicos em endpoint não produtivo

**Tratamento:** usar bucket exclusivo de produção e custom domain em domínio registrável separado de `molho.live`, mantendo UGC isolado dos cookies da aplicação. Aplicar credencial de menor privilégio e CORS somente para o backoffice.
**Gate:** upload presignado, leitura pública, cache, remoção e arquivo inválido testados.

### P1 — devem ser fechados ou aceitos explicitamente

- **CSP:** implantar coletor, observar violações em staging e então aplicar `Content-Security-Policy` no backoffice. Report-only sem coleta não é controle.
- **HSTS:** habilitar somente depois de todos os hosts e certificados estarem válidos; avaliar `includeSubDomains` com cuidado.
- **Runtime:** alinhar Vercel com Node 22, usado no CI e na API, para reduzir divergência.
- **OTP:** confirmar domínio Resend como verificado, enviar teste para Gmail/Outlook e observar bounce/spam. Não remover `send.send.molho.live` sem conferir o dashboard: ele pode ser o return-path padrão correto.
- **Checkout guest:** decidir se `checkout.guest` será ativado para o piloto. Sem isso, cada cliente passa por OTP no checkout e consome a cota do provedor.
- **WAF e bots:** a API fica DNS-only por causa do SSE/Fly. Validar rate limits sob o proxy real e monitorar abuso de OTP/checkout.
- **Analytics:** configurar PostHog apenas com consentimento e sem PII, ou deixar desativado no piloto.
- **Manutenção:** não executar migração ou cutover entre 18h e 23h.

### Limitações aceitas do piloto

Estas não bloqueiam se Cabanhas e PM aceitarem por escrito:

- PIX estático com confirmação manual e possível ambiguidade entre pagamentos de mesmo valor;
- estorno manual;
- cobrança da assinatura Molho operada manualmente pelo super-admin;
- ausência de domínio próprio do restaurante;
- ausência de cartão online, marketplace e demais itens fora do MVP.

## 6. Plano de execução

### Fase 0 — decisões e responsáveis

- [ ] Confirmar slug final e imutável: `cabanhas-bbq`.
- [ ] Confirmar que o domínio público do piloto será `cabanhas-bbq.molho.live`.
- [ ] Definir se o checkout será guest ou com OTP obrigatório.
- [ ] Confirmar meios aceitos: PIX estático e/ou pagamento na entrega.
- [ ] Obter chave PIX, nome do favorecido e instruções aprovadas pelo restaurante.
- [ ] Confirmar horários, pedido mínimo, zonas, taxas, endereço e geolocalização reais.
- [ ] Escolher estratégia de backup de 30 dias.
- [ ] Escolher domínio separado para assets públicos.
- [ ] Nomear responsável técnico e responsável do Cabanhas no horário do corte.
- [ ] Definir canal de incidente e fallback de pedidos por WhatsApp.
- [ ] Agendar janela fora do pico e plantão até o fim do serviço.

**Saída:** registro assinado das decisões, sem credenciais no repositório.

### Fase 1 — fechar os bloqueios de código

#### 1.1 Storefront por host

- [ ] Resolver e normalizar `Host`/`X-Forwarded-Host` somente de proxies confiáveis.
- [ ] Extrair slug apenas de `<slug>.molho.live` em produção.
- [ ] Reescrever internamente `/rota` para `/<slug>/rota` sem redirect público.
- [ ] Preservar modo por path para desenvolvimento e testes, se necessário.
- [ ] Rejeitar hosts reservados e slugs inexistentes com resposta correta.
- [ ] Gerar links públicos sem `/${slug}`.
- [ ] Corrigir canonical, Open Graph, manifest, sitemap e robots por host.
- [ ] Corrigir o link de compartilhamento no backoffice e o texto do signup.
- [ ] Congelar slug depois da publicação.

#### 1.2 BFF da storefront

- [ ] Criar rota/rewrite same-origin com allowlist explícita de endpoints públicos.
- [ ] Usar origin da API somente no servidor.
- [ ] Remover dependência de CORS direto no browser para o checkout.
- [ ] Não encaminhar cookies, Authorization ou headers internos desnecessários.
- [ ] Bloquear path traversal e qualquer namespace diferente de `/v1/store/*`.
- [ ] Preservar IP confiável necessário aos rate limits, sem aceitar spoofing.

#### 1.3 Validação de configuração

- [ ] Criar schema único para variáveis obrigatórias por aplicação/ambiente.
- [ ] Validar URLs HTTPS, papel correto das URLs Neon e ausência de `staging`.
- [ ] Em produção, exigir Redis, storage real, Sentry, Resend, chaves e peppers.
- [ ] Proibir fallback em memória/mock em produção.
- [ ] Garantir `MOLHO_DEBUG_PUBSUB` ausente ou falso.
- [ ] Adicionar testes de startup com configuração inválida.

#### 1.4 Impressão

- [ ] Implementar a credencial de dispositivo recomendada ou documentar fallback manual.
- [ ] Remover URL hardcoded de staging.
- [ ] Exibir estado offline/autenticação expirada de forma acionável.
- [ ] Evitar impressão duplicada após reconexão.
- [ ] Documentar pareamento, revogação e troca da impressora.

#### 1.5 Observabilidade e segurança

- [ ] Adicionar `/ready` com DB + Redis e timeout.
- [ ] Configurar Sentry e filtros de telefone, e-mail, endereço, token e cookie.
- [ ] Registrar release/commit e ambiente em cada app.
- [ ] Criar coletor de CSP e reduzir diretivas antes de enforcement.
- [ ] Garantir que logs de checkout, OTP e erros não contenham PII crua.
- [ ] Criar alerta para fila/stream sem consumo e taxa de erro de checkout.

#### 1.6 Cobertura automatizada obrigatória

- [ ] Unitários para parsing de host, reserved hosts e URLs.
- [ ] Integração do BFF com allowlist e headers.
- [ ] E2E do checkout no host real ou equivalente local.
- [ ] E2E de autenticação/backoffice e stream.
- [ ] Teste de isolamento tenant A/B e RLS fail-closed.
- [ ] Teste de slug congelado.
- [ ] Teste de configuração produtiva fail-fast.

**Gate da fase:**

```bash
pnpm lint
pnpm test
pnpm build
pnpm --filter api test:e2e
```

Não declarar a fase verde sem os três primeiros comandos completos e sem o E2E relevante.

### Fase 2 — criar a infraestrutura de produção

#### 2.1 Neon

- [ ] Criar projeto de produção em `aws-sa-east-1`.
- [ ] Definir plano/backup conforme a decisão da Fase 0.
- [ ] Executar `bootstrap.sql` como owner.
- [ ] Criar/configurar `app_runtime` e `app_migrator` com privilégios mínimos.
- [ ] Usar URL pooled `-pooler?...pgbouncer=true` somente no runtime.
- [ ] Usar URL direta somente para migrations.
- [ ] Guardar segredos no provedor e cofre; nunca em arquivo local versionado.
- [ ] Executar `prisma migrate deploy` uma única vez em runner seguro.
- [ ] Verificar owner das tabelas, políticas RLS e fail-closed sem `app.tenant_id`.
- [ ] Executar e documentar restore drill.

Não executar `prisma migrate dev` nem qualquer seed em produção.

#### 2.2 Upstash Redis

- [ ] Criar instância exclusiva de produção em São Paulo.
- [ ] Configurar TLS e credencial exclusiva.
- [ ] Validar pub/sub entre as duas máquinas Fly.
- [ ] Validar sessão, rate limit e reconexão após restart.

#### 2.3 R2

- [ ] Criar bucket exclusivo de produção.
- [ ] Criar service token de menor privilégio.
- [ ] Vincular custom domain isolado de `molho.live`.
- [ ] Configurar CORS somente para `https://app.molho.live`.
- [ ] Definir cache e política de remoção/retenção.

#### 2.4 Resend e caixa de contato

- [ ] Confirmar domínio como `Verified` no dashboard Resend.
- [ ] Confirmar SPF, DKIM, return-path e DMARC.
- [ ] Enviar OTP real para Gmail e Outlook e verificar entrega/bounce.
- [ ] Criar recebimento de `contato@molho.live` ou trocar o endereço publicado.

#### 2.5 Fly.io

- [ ] Criar app `molho-api` em `gru`.
- [ ] Criar configuração de produção separada; não reutilizar `fly.toml` de staging sem parametrização segura.
- [ ] Configurar duas máquinas sempre ligadas e rolling deploy.
- [ ] Injetar segredos produtivos pelo secret store da Fly.
- [ ] Configurar `MOLHO_CORS_ORIGINS=https://app.molho.live`.
- [ ] Fazer deploy primeiro no hostname `molho-api.fly.dev`.
- [ ] Verificar `/health`, `/ready`, logs e graceful shutdown.
- [ ] Adicionar certificado de `api.molho.live` antes de mudar DNS.

#### 2.6 Vercel

- [ ] Criar `molho-backoffice-prod`, root `apps/backoffice`.
- [ ] Criar `molho-storefront-prod`, root `apps/storefront`.
- [ ] Fixar Node 22 nos projetos produtivos.
- [ ] Configurar Production envs, sem promover automaticamente o primeiro build.
- [ ] Fazer deployments produtivos isolados com `--prod --skip-domain`.
- [ ] Testar pelas URLs de deployment antes de promover/associar domínios.
- [ ] Adicionar `app.molho.live` ao backoffice.
- [ ] Adicionar explicitamente `cabanhas-bbq.molho.live` à storefront.

### Fase 3 — matriz de configuração

Nenhum valor secreto deve aparecer neste documento, em issue, chat ou log.

| App | Configuração produtiva mínima |
|---|---|
| API/Fly | `DATABASE_URL`, `DIRECT_URL` somente no job de migration, `REDIS_URL`, chaves de criptografia/hash/JWT, Resend/OTP, CORS, R2/S3, Sentry, `NODE_ENV=production`, `PORT` |
| Backoffice | `NEXT_PUBLIC_API_URL=https://api.molho.live`, Sentry, release/ambiente, HSTS após TLS |
| Storefront | root domain `molho.live`, origin server-only da API, modo subdomínio/BFF, Sentry, release/ambiente |
| Site | `NEXT_PUBLIC_SITE_URL=https://molho.live`, `NEXT_PUBLIC_APP_URL=https://app.molho.live`, canonical, Sentry/analytics se aprovados |

Regras de validação:

- [ ] nenhuma variável produtiva contém `staging`, salvo texto de teste deliberado;
- [ ] nenhuma URL default para `vercel.app` ou `r2.dev` é usada;
- [ ] runtime Neon usa papel `app_runtime` e conexão pooled;
- [ ] migration usa papel `app_migrator` e conexão direta;
- [ ] chaves produtivas são diferentes das de staging;
- [ ] chaves de criptografia têm cópia segura e procedimento de recuperação;
- [ ] `MOLHO_DEBUG_PUBSUB` está desativado.

### Fase 4 — provisionar o Cabanhas sem copiar staging

O arquivo `packages/db/prisma/seed/cabanhas.sql` não pode ser usado: contém IDs/dados de staging e operações de reset.

- [ ] Criar o tenant pelo onboarding/fluxo administrativo de produção.
- [ ] Criar owner real e validar OTP.
- [ ] Usar CNPJ, endereço e coordenadas confirmados pelo restaurante.
- [ ] Configurar tema, logo e assets no bucket de produção.
- [ ] Importar catálogo aprovado por CSV/XLSX e conferir centavos/imagens.
- [ ] Configurar horários, zonas, taxas, pedido mínimo e indisponibilidades.
- [ ] Configurar PIX estático e pagamento na entrega conforme decisão.
- [ ] Ativar apenas módulos contratados/released/enabled.
- [ ] Decidir explicitamente `checkout.guest`.
- [ ] Manter storefront não publicada até o aceite final.
- [ ] Não copiar clientes, pedidos, sessões ou auditoria de staging.

Módulos mínimos esperados para o piloto: `catalog`, `orders`, `customers`, `channel.storefront`, `delivery.zones`, `payments.pix_static` e/ou `payments.on_delivery`, `notify.whatsapp_ctc` e `printing.escpos` somente se o agente estiver aprovado.

### Fase 5 — ensaio de release e rollback

- [ ] Congelar o commit candidato e registrar SHA.
- [ ] Confirmar CI verde nesse SHA.
- [ ] Fazer build produtivo sem domínio na Vercel.
- [ ] Fazer deploy da API e migrations compatíveis com expansão.
- [ ] Testar o RC pelas URLs técnicas.
- [ ] Registrar IDs das deployments Vercel, release/imagem Fly e migration.
- [ ] Ensaiar `vercel rollback <deployment>` em projeto de teste/staging.
- [ ] Listar a imagem anterior da Fly e ensaiar redeploy dela em staging.
- [ ] Confirmar que rollback de app não exige rollback destrutivo de banco.
- [ ] Testar restore do backup para um banco isolado.

Toda migration perto do go-live deve ser backward-compatible: expandir primeiro, publicar código compatível e só remover estrutura em release posterior.

### Fase 6 — DNS e TLS

Adicionar os domínios nas plataformas antes de criar os registros DNS e copiar exatamente os targets apresentados pelos provedores.

- [ ] Vercel: adicionar `app.molho.live`.
- [ ] Vercel: adicionar `cabanhas-bbq.molho.live`.
- [ ] Fly: adicionar certificado para `api.molho.live`.
- [ ] Cloudflare DNS-only: criar os registros do backoffice e storefront conforme targets Vercel.
- [ ] Cloudflare DNS-only: criar A/AAAA da API conforme Fly.
- [ ] Verificar eventuais conflitos CAA.
- [ ] Aguardar certificados emitidos e validar SNI/TLS em todos os hosts.
- [ ] Configurar redirect permanente de `www.molho.live` para o apex.
- [ ] Habilitar HSTS somente após todos os checks.

Comandos de inspeção, sem segredos:

```bash
dig +short app.molho.live
dig +short api.molho.live
dig +short cabanhas-bbq.molho.live
curl -fsS https://api.molho.live/health
curl -fsS https://api.molho.live/ready
fly status --app molho-api
fly checks list --app molho-api
fly certs check api.molho.live --app molho-api
```

### Fase 7 — smoke test produtivo

Executar com um pedido marcado como teste e cancelá-lo pelo fluxo normal; nunca apagar registros de auditoria.

- [ ] Apex abre, `www` redireciona e todos os CTAs apontam para produção.
- [ ] Login/signup/OTP funcionam e cookies têm atributos corretos.
- [ ] Backoffice não aceita origem inesperada.
- [ ] Loja abre no host do Cabanhas sem slug no path.
- [ ] Links profundos e refresh funcionam.
- [ ] Catálogo, imagens, disponibilidade, preço e carrinho estão corretos.
- [ ] Endereço, geocode, zona, taxa, horário e mínimo são aplicados.
- [ ] Checkout guest ou OTP segue a decisão da Fase 0.
- [ ] Divergência desfavorável exige consentimento.
- [ ] Pedido é criado uma vez, com snapshot e auditoria.
- [ ] Pedido aparece no gestor em menos de 3 segundos.
- [ ] SSE continua após refresh de token, reconexão e restart de uma máquina.
- [ ] Polling recupera atualização quando stream cai.
- [ ] Pagamento manual, mudança de status e máquina de estados funcionam.
- [ ] WhatsApp click-to-chat contém texto correto sem usar API não oficial.
- [ ] Impressão física ocorre uma vez e sobrevive ao teste de 60 minutos, ou fallback manual é executado.
- [ ] Acompanhamento do pedido funciona no celular em 4G.
- [ ] Tenant cruzado e acesso sem `tenant_id` são negados.
- [ ] Sentry recebe erro sintético sem PII.
- [ ] Monitor externo vê `/health` e `/ready`.
- [ ] Logs não exibem telefone, e-mail, endereço, token ou chave PIX indevidos.
- [ ] Backup/restore tem evidência recente.

### Fase 8 — corte

#### T-7 dias

- fechar jurídico, e-mail, contas, assets e backup;
- fazer treinamento com Cabanhas;
- instalar/testar agente, impressora, papel, cabo e rede;
- entregar runbook resumido e contatos.

#### T-48 horas

- congelar o release candidate;
- concluir infra e migrations;
- cadastrar dados reais e fazer conferência conjunta;
- emitir certificados e terminar smoke técnico;
- manter storefront não publicada.

#### T-24 horas

- dry run no restaurante com aparelho, rede e impressora reais;
- pedido completo de cada meio de pagamento;
- simular internet instável, impressora desligada e restart de máquina;
- confirmar fallback por WhatsApp e responsáveis.

#### T-2 horas

- conferir dashboards, alertas, certificados e capacidade;
- registrar deployment/release anterior para rollback;
- confirmar que não há manutenção de provedor;
- obter “go” de PM, técnico e Cabanhas.

#### T0

1. promover API e fronts já testados;
2. publicar/ativar a storefront e os módulos do Cabanhas;
3. executar smoke curto de compra;
4. trocar CTA do site institucional para `app.molho.live`;
5. anunciar abertura ao restaurante;
6. iniciar acompanhamento dedicado.

#### T+0 a T+2 horas e primeiro serviço

- acompanhar checkout, latência, SSE, filas, impressão, OTP e erros;
- ficar de plantão durante todo o primeiro pico, recomendado 17h30–23h30;
- registrar incidentes e decisões em timeline;
- fazer revisão no dia seguinte, sem mudanças oportunistas durante o pico.

## 7. Critérios formais de GO/NO-GO

### GO somente se todos forem verdadeiros

- [ ] `pnpm lint`, `pnpm test`, `pnpm build` e E2E relevante verdes no SHA publicado.
- [ ] Todos os P0 deste documento estão fechados.
- [ ] DNS e TLS válidos para os cinco hosts.
- [ ] Nenhum CTA/config produtivo aponta para staging.
- [ ] Duas máquinas Fly saudáveis e pub/sub cruzado provado.
- [ ] Alerta Sentry/uptime chegou ao responsável.
- [ ] Restore de backup foi testado.
- [ ] Jurídico e canal de contato estão aprovados.
- [ ] Cabanhas aprovou catálogo, preços, PIX, horários, zonas e mínimo.
- [ ] Impressão física aprovada ou fallback manual formalmente aceito.
- [ ] Runbook e plantão estão ativos.

Qualquer item ausente resulta em **NO-GO**, sem exceção implícita. Uma exceção deve ser registrada com risco, responsável, validade e fallback.

## 8. Rollback e resposta a incidente

### Gatilhos de rollback imediato

- criação de pedido com erro ou duplicidade relevante;
- pedido não aparece no gestor em até 10 segundos de forma recorrente;
- isolamento de tenant, exposição de PII ou autenticação comprometidos;
- cálculo incorreto de preço, taxa, mínimo ou pagamento;
- indisponibilidade sustentada da API/DB;
- impressão indisponível sem fallback operacional.

### Sequência

1. despublicar/desabilitar `channel.storefront` do Cabanhas, preservando os pedidos existentes;
2. avisar o restaurante e ativar o fallback combinado por WhatsApp;
3. fazer rollback da Vercel para o deployment anterior;
4. redeployar na Fly a imagem anterior registrada;
5. não executar down migration destrutiva durante o incidente;
6. validar pedidos/auditoria já recebidos;
7. comunicar status e próximo checkpoint;
8. corrigir e repetir o smoke antes de reabrir.

Banco só deve ser restaurado em incidente de dados confirmado e após preservar evidência. Restore não substitui correção de aplicação e pode perder pedidos válidos posteriores ao ponto restaurado.

## 9. Entrega ao agente executor

O agente deve trabalhar na ordem das fases e manter este documento atualizado com evidências. Regras:

- não criar ou copiar credenciais em arquivos do repositório;
- não reutilizar banco, Redis, bucket ou chaves de staging;
- não executar `seed/cabanhas.sql` em produção;
- não ampliar CORS para `*.molho.live`;
- não remover RLS, auditoria, snapshots, locks ou optimistic locking;
- não declarar gate verde sem os comandos obrigatórios completos;
- não apontar DNS antes de o deployment e o certificado estarem preparados;
- registrar SHA, IDs de deployment/release, migration e horário de cada corte;
- pedir decisão do PM apenas nos pontos explicitamente listados na Fase 0;
- parar em NO-GO se um P0 não puder ser comprovado.

Artefatos finais esperados:

- [ ] PR(s) dos bloqueios de código com testes;
- [ ] inventário produtivo sem segredos;
- [ ] matriz de variáveis com apenas nomes e responsáveis;
- [ ] evidências dos gates e smoke;
- [ ] runbook operacional de uma página para o Cabanhas;
- [ ] runbook técnico de incidente/rollback;
- [ ] aceite de PM, técnico, jurídico e responsável do restaurante;
- [ ] relatório das primeiras 24 horas do piloto.

## 10. Fontes operacionais externas

- Vercel — adicionar domínios e wildcard: <https://vercel.com/docs/domains/working-with-domains/add-a-domain>
- Vercel — promover deployment: <https://vercel.com/docs/deployments/promoting-a-deployment>
- Vercel — rollback: <https://vercel.com/docs/cli/rollback>
- Fly — custom domains e certificados: <https://fly.io/docs/networking/custom-domain/>
- Fly — health checks: <https://fly.io/docs/reference/health-checks/>
- Fly — estratégias de deploy: <https://fly.io/docs/launch/deploy/>
- Neon — connection pooling: <https://neon.com/docs/connect/connection-pooling>
- Neon — planos e histórico de restore: <https://neon.com/pricing>
- Cloudflare R2 — buckets públicos e custom domains: <https://developers.cloudflare.com/r2/buckets/public-buckets/>
- Resend — verificação de domínio: <https://resend.com/docs/dashboard/domains/introduction>

## 11. Prompt sugerido para o agente executor

> Execute o plano `docs/13-plano-go-live-producao-cabanhas.md` na ordem definida. Comece revalidando o estado atual e fechando a Fase 0 com o PM; depois implemente e teste todos os P0 da Fase 1 antes de criar ou alterar infraestrutura produtiva. Mantenha os checkboxes e as evidências no próprio documento. Não copie dados ou credenciais de staging, não use o seed do Cabanhas em produção, não amplie o CORS para wildcard e não aponte DNS antes de deployments, certificados, rollback e smoke estarem prontos. Pare em NO-GO se qualquer P0 ou aceite obrigatório não puder ser comprovado. Nunca inclua valores secretos no repositório, logs ou handoff.
