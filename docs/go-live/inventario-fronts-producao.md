# Inventário de produção — fronts

**Atualizado em:** 2026-09-09
**Regra:** nomes e IDs operacionais podem constar; valores de secrets não. Nenhum domínio
produtivo foi associado e nenhum deployment foi criado nesta preparação.

## Projetos Vercel

| Projeto | ID | Root | Node | Estado |
|---|---|---|---|---|
| `molho-site` | `prj_zLsTStjMPMF1thOSIMjuYEwNE4Xa` | `apps/site` | `22.x` | existente; runtime alinhado ao CI |
| `molho-backoffice-prod` | `prj_wIPYqwJEXxNhtkEZS9DvFh25AnCG` | `apps/backoffice` | `22.x` | criado, sem deployment/domínio/envs finais |
| `molho-storefront-prod` | `prj_r6HYUawAZGy0TD3kiVLgOeCJ3JqW` | `apps/storefront` | `22.x` | criado, sem deployment/domínio/envs finais |

Escopo Vercel: `vinigehlens-projects`. CI usa Node 22. O projeto de staging não foi
alterado.

## Domínios congelados

| Uso | URL | Estado |
|---|---|---|
| Site | `https://molho.live` | existente; validar certificado no RC |
| Redirect | `https://www.molho.live` → `https://molho.live` | preparar após `ZG-3` |
| Backoffice | `https://app.molho.live` | não associar antes do corte |
| API | `https://api.molho.live` | trilha CC; não apontar DNS |
| Loja piloto | `https://cabanhas-bbq.molho.live` | cadastro explícito, sem wildcard; não associar antes do corte |
| Assets | origin R2 decidida na ata `NG-01` | trilha CC entrega a origin final ao RC |

## Variáveis por projeto

### Comuns aos três fronts

- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`;
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`, `SENTRY_ENVIRONMENT`;
- `NEXT_PUBLIC_SENTRY_RELEASE`, `SENTRY_RELEASE` (fallback: `VERCEL_GIT_COMMIT_SHA`);
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`, `SENTRY_TRACES_SAMPLE_RATE`;
- `MOLHO_CSP_REPORT_ONLY`;
- `MOLHO_ENABLE_HSTS`, `MOLHO_HSTS_INCLUDE_SUBDOMAINS`.

### Storefront

- `MOLHO_API_INTERNAL_URL` — server-only; URL técnica HTTPS entregue por C5;
- `MOLHO_STOREFRONT_ROOT_DOMAIN=molho.live`;
- `MOLHO_STOREFRONT_PATH_MODE=false`;
- `MOLHO_STOREFRONT_TECHNICAL_SLUG=cabanhas-bbq`;
- `MOLHO_STOREFRONT_PUBLIC_URL` — fallback técnico opcional;
- `MOLHO_ASSETS_ORIGIN` — origin final entregue por C4;
- opcionais com consentimento: `NEXT_PUBLIC_POSTHOG_KEY`,
  `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA_ID`.

### Backoffice

- `NEXT_PUBLIC_API_URL` — origin final da API;
- `MOLHO_ASSETS_ORIGIN` — origin final entregue por C4.

### Site

- `NEXT_PUBLIC_SITE_URL=https://molho.live`;
- `NEXT_PUBLIC_APP_URL=https://app.molho.live`;
- opcionais com consentimento: `NEXT_PUBLIC_POSTHOG_KEY`,
  `NEXT_PUBLIC_POSTHOG_HOST`, `NEXT_PUBLIC_GA_ID`.

As Production envs só serão gravadas quando C4/C5 entregar origins definitivas e os três
projetos Sentry existirem. O código falha no build produtivo quando uma entrada obrigatória
está ausente ou aponta para HTTP/staging.
