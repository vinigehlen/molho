# Runbook — release e rollback dos fronts

Este runbook não autoriza DNS nem publicação do tenant. Executar apenas com o SHA candidato
congelado e as condições de `ZG-1`/`ZG-2` comprovadas.

## Pré-condições

- C4 entrega `MOLHO_ASSETS_ORIGIN`; C5 entrega a URL técnica HTTPS da API;
- Production envs completas nos três projetos, sem valor de staging;
- Sentry/release ativos e CSP em enforcement;
- `pnpm lint && pnpm test && pnpm build` verdes no mesmo SHA;
- `pnpm verify:front-release` e E2E Playwright verdes;
- nenhuma alteração simultânea de config/domínio nos projetos.

## Build imutável sem domínio

1. Confirmar escopo com `vercel whoami` e projeto com `vercel project inspect <projeto>`.
2. Linkar o monorepo com `vercel link --repo`; nunca usar link simples para os três apps.
3. Para cada projeto, puxar somente Production env e executar:

   ```bash
   vercel pull --yes --environment=production
   vercel build --prod
   vercel deploy --prebuilt --prod --skip-domain
   ```

4. Registrar SHA, project ID, deployment ID/URL e horário em `evidencias-codex.md`.
5. Validar a URL técnica com `vercel curl --deployment <url>`; na storefront, configurar
   `MOLHO_STOREFRONT_TECHNICAL_SLUG=cabanhas-bbq` antes do build.
6. Rodar o E2E positivo e as negativas do BFF/CSP contra os deployments.

`--skip-domain` é obrigatório: gera o candidato produtivo sem mover alias/custom domain.

## Promoção no corte

Somente depois de `ZG-5`:

1. `vercel promote <deployment-url>` no site, backoffice e storefront;
2. associar `app.molho.live` e o domínio explícito `cabanhas-bbq.molho.live`;
3. validar TLS, canonical, CSP, Sentry e smoke;
4. preparar `www.molho.live → molho.live`;
5. só então o responsável técnico autoriza o passo separado de publicação do canal.

## Rollback

- Config/domínio ruim antes do corte: não promover; corrigir env e gerar outro RC.
- Regressão após promoção: `vercel rollback <deployment-url-anterior>` ou promover o
  deployment READY anterior.
- Não rebuildar durante rollback. Registrar deployment anterior antes da promoção.
- Revalidar `/`, login, catálogo, BFF e tracking após rollback.

## Stop conditions

Parar e manter NO-GO se houver env ausente, URL de staging, CSP report-only, certificado
inválido, deployment não READY, E2E falho, alerta sem destino ou ausência de rollback
anterior. Nunca aliviar o fail-fast para fazer o RC passar.
