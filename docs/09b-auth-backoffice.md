# Épico 9b — autenticação do backoffice

Status: **mesclado no `main` (2026-09-02), gate verde.** Falta só o deploy/promoção ao domínio do gestor (Épico 9c — infra real).

## Fluxo

1. `/login` consulta `GET /v1/auth/otp/config` para exibir e-mail ou celular conforme `OTP_CHANNEL_STAFF`.
2. `POST /v1/auth/otp/request` envia o código; `POST /v1/auth/otp/verify` devolve somente o access token curto e grava o refresh em cookie `httpOnly`.
3. `GET /v1/me/sessions/tenants` lista apenas tenants/lojas cobertos pelos scopes do JWT. Um tenant entra direto; vários exibem o seletor.
4. O access token vive somente em memória. No reload, `POST /v1/auth/refresh` rotaciona o refresh e reconstrói a sessão.
5. Resposta `401` de uma chamada autenticada tenta um único refresh e repete a chamada uma vez. Refreshes concorrentes compartilham a mesma Promise na aba e usam `navigator.locks` entre abas para não disparar a proteção de reutilização do token.
6. Todo `/gestor/*` passa pelo layout autenticado. `/` redireciona para `/gestor`.
7. Logout sincroniza/avisa sobre a fila offline, chama `stream/disarm`, revoga o dispositivo atual em `POST /v1/auth/logout`, limpa o cookie e só então apaga a sessão em memória.
8. Logout local ou recebido de outra aba redireciona todas as abas do gestor para `/login`; o evento compartilhado não contém credenciais.

## Fronteiras de segurança

- Cookie: `__Host-molho_refresh`; `HttpOnly; Secure; SameSite=Strict; Path=/`; sem `Domain`; 30 dias deslizantes e rotação a cada uso.
- `__Host-` exige `Path=/` pela especificação do browser. Portanto ele não pode coexistir com path restrito ao endpoint de refresh. A proteção escolhida mantém o prefixo host-only e exige `X-Molho-Client: backoffice` em refresh/logout; o header força preflight, e a allowlist CORS exata bloqueia storefronts e previews.
- O refresh token não aparece no JSON nem em storage acessível a JavaScript.
- `sessionStorage` guarda somente o tenant preferido; não guarda access nem refresh.
- Logout remoto falhou: a sessão local não é descartada, para não parecer que o tablet saiu enquanto cookies válidos permanecem na API.
- A listagem de tenants parte exclusivamente dos scopes do JWT verificado e usa IDs explícitos no `WHERE`. Não lê `user_roles` em massa.

## Recuperação de acesso

Não existe reset de senha: o gestor usa OTP. Se um staff perdeu acesso ao e-mail/celular do OTP, a recuperação no MVP é operacional e auditada:

1. Outro owner do mesmo tenant pede a troca do contato ou recria o vínculo do staff.
2. Se não houver owner com acesso, suporte Molho valida a titularidade por dados comerciais/contratuais antes de alterar o destino do OTP.
3. A troca nunca emite sessão sem OTP e nunca reaproveita o contato antigo como prova única.
4. Toda alteração feita por suporte grava auditoria com ator, motivo, antes/depois e timestamp.

Detalhe completo do fluxo MVP: `docs/02-definicoes-v1.md` §5.6.

## Configuração de staging conferida em 2026-08-14

- Fly possui `OTP_CHANNEL_STAFF`, `RESEND_API_KEY`, `MOLHO_EMAIL_FROM`, `MOLHO_EMAIL_PEPPER`, JWT, Redis e CORS.
- O tenant `cabanhas-bbq` existe como “Cabanhas BBQ”. Há dois vínculos owner, dos quais um está ativo e possui identidade por e-mail. Nenhum endereço ou hash foi exposto durante a conferência.
- O backoffice já possui `NEXT_PUBLIC_API_URL=https://api.staging.molho.live`.

## Verificação

- Unitários API: 415/415, incluindo cookie, header anti-CSRF, rotação, reuso e logout.
- Unitários backoffice: 83/83, incluindo sessão somente em memória, retry após `401`, deduplicação de refresh concorrente na aba/entre abas, estados de carregamento/erro do login e propagação de logout entre abas.
- Build isolado do backoffice: verde; rota `/login` gerada.
- Gate padrão raiz: `pnpm lint && pnpm test && pnpm build` verde.
- E2E real completo: 79/80 passou inicialmente e revelou um defeito no tombstone Redis de refresh reutilizado. O `SET ... GET` gravava `userId`/`deviceId` vazios; a revogação recebia UUID vazio e respondia 500. A operação agora usa script Lua atômico, preserva a identidade no tombstone e mantém a detecção de corrida. Após a correção, o e2e focado de auth passou 13/13 e a suíte completa passou 80/80 em 10 arquivos, com 0 skipped.
- Hardening do e2e: `beforeAll`/`afterAll` agora têm 30s e o cleanup só inclui `testTenantId` quando ele foi realmente atribuído. Antes, timeout do hook seguido por `deleteMany({ tenantId: undefined })` faria o Prisma omitir o filtro e tentar apagar todos os customers do ambiente; a FK de orders impediu o dano na rodada que revelou o bug.

## Antes do deploy

1. Revisar a branch.
2. Preservar o gate e2e já confirmado: 80/80, sem falhas nem skips.
3. Rodar `pnpm lint && pnpm test && pnpm build` na raiz.
4. Incluir `https://staging-app.molho.live` na allowlist exata de CORS da API antes do deploy; a configuração histórica apontava para `https://staging.molho.live`.
5. Após deploy da API e do backoffice, validar no navegador: OTP real, reload, refresh aos 15 minutos, SSE rearmado, tenant correto e logout removendo os dois cookies.
