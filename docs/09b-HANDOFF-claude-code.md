# Handoff para revisão — Épico 9b

Data: 2026-08-14  
Branch: `codex/epico-9b-login-staff`  
PR draft: `#1` — `https://github.com/vinigehlen/molho/pull/1`  
Base observada ao iniciar: `main@2481d1e`  
Estado: implementado e em validação final; **sem merge e sem deploy do 9b**.

## O que foi entregue

### API

- Fluxo web de OTP de staff com configuração de canal, solicitação e validação.
- Access token curto devolvido no JSON e mantido somente em memória pelo backoffice.
- Refresh token opaco no cookie `__Host-molho_refresh`, `HttpOnly`, `Secure`, `SameSite=Strict`, `Path=/` e sem `Domain`.
- Rotação de refresh a cada uso, detecção de reuso e revogação das sessões do usuário.
- `POST /v1/auth/refresh` e `POST /v1/auth/logout` exigem `X-Molho-Client: backoffice`; combinado com CORS exato, o header força preflight.
- `GET /v1/me/sessions/tenants` retorna somente tenants/lojas alcançados pelos scopes do JWT, com filtros explícitos por ID.
- Cleanup e2e protegido: nenhum `deleteMany` recebe `tenantId: undefined` quando o setup falha.

### Backoffice

- Tela `/login` com canal definido por `GET /v1/auth/otp/config`.
- Durante o bootstrap não mostra “Celular” por padrão; falha de rede vira mensagem pt-BR e botão de tentar novamente.
- Bootstrap autenticado em todo `/gestor/*`; `/` redireciona para o gestor.
- Access token somente em memória; `sessionStorage` guarda apenas a preferência de tenant.
- Refresh automático após `401`, com uma tentativa e um retry da chamada original.
- Deduplicação concorrente na aba por Promise e entre abas por `navigator.locks`.
- Seletor explícito para staff com acesso a múltiplos tenants.
- Integração com SSE: refresh do token e rearme do stream.
- Logout tenta sincronizar/avisa sobre fila offline, desarma o stream, revoga a sessão remota e então limpa a sessão local.
- Logout é propagado entre abas por evento transitório em `localStorage`; o evento não contém token nem outra credencial.
- Stub `/dev-login` e substituição de build removidos.

## Correções encontradas durante o teste manual e e2e

1. A tela mostrava “Celular” enquanto `/otp/config` ainda não havia respondido e expunha `Failed to fetch`. Foi criado estado explícito de carregamento/erro/retry e tradução de erros de rede.
2. Logout numa aba não encerrava as demais. Foi adicionado evento de logout sem credenciais, ouvido pelo layout autenticado.
3. O tombstone Redis criado por `SET ... GET` gravava `userId` e `deviceId` vazios. No segundo uso do refresh, a revogação consultava UUID vazio e a API devolvia 500. O consumo agora roda em script Lua atômico: lê o valor, preserva a identidade, marca `reused` e renova o TTL numa única execução Redis. O cenário volta a responder 401 e revoga as sessões.

## Commits da branch

- `a1fb99a` — protege a sessão web do staff com refresh rotativo
- `90d03bb` — cria o login real do dono no backoffice
- `143146a` — documenta a autenticação do backoffice
- `f5bb0b5` — impede cleanup global quando o setup e2e falha
- `6cbfd87` — documenta autenticação e domínio do gestor
- `1f7d400` — corrige os estados de carregamento do login
- `c46027a` — propaga o logout entre as abas do gestor
- `cddca0b` — preserva a identidade ao detectar reuso de refresh

## Infra criada e estado atual

- Projeto Vercel dedicado: `molho-backoffice-staging`.
- Root Directory: `apps/backoffice`; Framework: Next.js; Node.js 24.x; build/output padrão do Next.
- Domínio do gestor: `https://staging-app.molho.live`.
- Domínio técnico: `https://molho-backoffice-staging.vercel.app`.
- DNS: CNAME de `staging-app.molho.live` para `f8ec698b54ba38f0.vercel-dns-017.com`; Vercel mostrou configuração válida.
- `NEXT_PUBLIC_API_URL=https://api.staging.molho.live` configurada em Production e Preview.
- O custom domain ainda aponta para o deploy de `main@2481d1e`. O preview que ficou Ready era da branch em `f5bb0b5`; as correções posteriores não foram promovidas.
- A API publicada ainda não contém o 9b: `GET https://api.staging.molho.live/v1/auth/otp/config` respondeu 404 na conferência.
- A allowlist histórica de CORS precisa incluir `https://staging-app.molho.live` antes de testar o fluxo publicado. Não inferir que a variável existente já contém o domínio novo.

## Evidência de validação

- Testes focados do store/token: 22/22.
- E2E de auth depois da correção Redis: 13/13, incluindo cookie, rotação única, reuso com 401 e logout.
- Suíte e2e completa depois da correção: 10 arquivos, 80/80 testes, 0 skipped. A rodada anterior havia passado 79/80; a única falha era o bug Redis descrito acima.
- Gate raiz final: `pnpm lint && pnpm test && pnpm build` verde; API 415/415, backoffice 83/83 e build 6/6.
- Há latência/flakiness de rede conhecida em Neon/Redis; um caso antigo de segundo login levou cerca de 62s mesmo passando. Não foi ampliado o escopo para caçar essa dívida.

## Pontos que o Claude deve revisar

1. Cookie `__Host-`, CORS e header anti-CSRF, especialmente a decisão obrigatória de `Path=/`.
2. Atomicidade do script Lua e resposta de segurança ao reuso de refresh.
3. Ausência de access/refresh token em `localStorage` e `sessionStorage`.
4. Coordenação de refresh e logout entre abas.
5. Ordem do logout: fila offline → `stream/disarm` → logout remoto → limpeza local.
6. Derivação dos tenants exclusivamente dos scopes verificados e consultas com IDs explícitos.
7. Bootstrap, retry e mensagens do login em e-mail/SMS.
8. Proteções do cleanup e2e contra exclusão ampla.

## Ordem segura depois da revisão

1. Claude revisa o PR e registra findings; Vinicius decide o merge.
2. Atualizar a allowlist CORS da Fly para o domínio do gestor.
3. Fazer deploy da API e verificar `/v1/auth/otp/config` retornando 200.
4. Fazer deploy/promoção do backoffice revisado no domínio `staging-app.molho.live`.
5. Testar no navegador: OTP real por e-mail, reload, refresh, tenant, SSE, logout, duas abas e fila offline.

Nenhum merge, promoção ou deploy foi executado nesta etapa.
