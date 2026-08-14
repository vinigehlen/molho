# Épico 9b — autenticação do backoffice

Status: implementado na branch `codex/epico-9b-login-staff`, aguardando revisão e deploy.

## Fluxo

1. `/login` consulta `GET /v1/auth/otp/config` para exibir e-mail ou celular conforme `OTP_CHANNEL_STAFF`.
2. `POST /v1/auth/otp/request` envia o código; `POST /v1/auth/otp/verify` devolve somente o access token curto e grava o refresh em cookie `httpOnly`.
3. `GET /v1/me/sessions/tenants` lista apenas tenants/lojas cobertos pelos scopes do JWT. Um tenant entra direto; vários exibem o seletor.
4. O access token vive somente em memória. No reload, `POST /v1/auth/refresh` rotaciona o refresh e reconstrói a sessão.
5. Resposta `401` de uma chamada autenticada tenta um único refresh e repete a chamada uma vez. Refreshes concorrentes compartilham a mesma Promise na aba e usam `navigator.locks` entre abas para não disparar a proteção de reutilização do token.
6. Todo `/gestor/*` passa pelo layout autenticado. `/` redireciona para `/gestor`.
7. Logout sincroniza/avisa sobre a fila offline, chama `stream/disarm`, revoga o dispositivo atual em `POST /v1/auth/logout`, limpa o cookie e só então apaga a sessão em memória.

## Fronteiras de segurança

- Cookie: `__Host-molho_refresh`; `HttpOnly; Secure; SameSite=Strict; Path=/`; sem `Domain`; 30 dias deslizantes e rotação a cada uso.
- `__Host-` exige `Path=/` pela especificação do browser. Portanto ele não pode coexistir com path restrito ao endpoint de refresh. A proteção escolhida mantém o prefixo host-only e exige `X-Molho-Client: backoffice` em refresh/logout; o header força preflight, e a allowlist CORS exata bloqueia storefronts e previews.
- O refresh token não aparece no JSON nem em storage acessível a JavaScript.
- `sessionStorage` guarda somente o tenant preferido; não guarda access nem refresh.
- Logout remoto falhou: a sessão local não é descartada, para não parecer que o tablet saiu enquanto cookies válidos permanecem na API.
- A listagem de tenants parte exclusivamente dos scopes do JWT verificado e usa IDs explícitos no `WHERE`. Não lê `user_roles` em massa.

## Configuração de staging conferida em 2026-08-14

- Fly possui `OTP_CHANNEL_STAFF`, `RESEND_API_KEY`, `MOLHO_EMAIL_FROM`, `MOLHO_EMAIL_PEPPER`, JWT, Redis e CORS.
- O tenant `cabanhas-bbq` existe como “Cabanhas BBQ”. Há dois vínculos owner, dos quais um está ativo e possui identidade por e-mail. Nenhum endereço ou hash foi exposto durante a conferência.
- O backoffice já possui `NEXT_PUBLIC_API_URL=https://api.staging.molho.live`.

## Verificação

- Unitários API: 415/415, incluindo cookie, header anti-CSRF, rotação, reuso e logout.
- Unitários backoffice: 76/76, incluindo sessão somente em memória, retry após `401` e deduplicação de refresh concorrente na aba/entre abas.
- Build isolado do backoffice: verde; rota `/login` gerada.
- Gate padrão raiz: `pnpm lint && pnpm test && pnpm build` verde.
- E2E real de auth: duas rodadas bloqueadas pela flakiness conhecida do Neon (`P2028` ao iniciar/commit de transações). Na rodada completa, 11/13 falharam, inclusive testes antigos de customer; na rodada focada, os três casos novos falharam no `POST /otp/verify` antes de alcançar cookie/refresh/logout. Não marcar e2e real como verde até uma nova rodada conseguir falar de forma estável com o banco.

## Antes do deploy

1. Revisar a branch.
2. Repetir `auth.e2e.test.ts` com Neon estável.
3. Rodar `pnpm lint && pnpm test && pnpm build` na raiz.
4. Após deploy da API e do backoffice, validar no navegador: OTP real, reload, refresh aos 15 minutos, SSE rearmado, tenant correto e logout removendo os dois cookies.
