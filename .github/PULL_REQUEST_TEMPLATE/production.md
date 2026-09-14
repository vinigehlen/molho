<!--
Checklist de promoção main → production. Esse PR muda o que roda em
app.molho.live / cabanhas-bbq.molho.live / api.molho.live. Confira staging
antes de mergear — ver docs/go-live/evidencias-cc.md (separação staging/prod).
-->

## Checklist antes de mergear pra produção

- [ ] Smoke test manual em staging (`staging.molho.live`, `staging-app.molho.live`, `api.staging.molho.live/ready`) cobrindo o que mudou
- [ ] Sem erro novo no Sentry de staging desde o último deploy
- [ ] Migration nova (se houver) já rodou em staging sem quebrar
- [ ] CI (`quality`) verde neste PR — se estiver vermelho, confirmado que é falha pré-existente não relacionada

## O que está indo pra produção
