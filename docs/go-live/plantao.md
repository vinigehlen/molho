# Processo de plantão — piloto Cabanhas BBQ

Processo enxuto para o piloto (1 restaurante, ~20 pedidos/dia, horários variados). Um
único responsável de plantão nesta fase. Revisar quando entrar o 2º tenant.

## Contato de plantão

| Papel | Contato | Uso |
|---|---|---|
| Plantonista (único) | WhatsApp **51-99261-6964** · e-mail **superadmin.molho.live@gmail.com** | recebe todo alerta; responde incidente |
| Operador Cabanhas | (preencher no `NG-01`) | avisado em incidente P1; aciona fallback manual |

Todos os alertas automáticos (Sentry, uptime) vão para `superadmin.molho.live@gmail.com`.
Incidente P1 dispara também mensagem manual no WhatsApp do plantonista e do operador.

## Severidade

| Nível | Definição | Resposta esperada |
|---|---|---|
| **P1** | Loja fora do ar, não recebe pedido, não imprime comanda, ou pagamento quebrado | agir em ≤15 min; se não resolver em 30 min, acionar fallback manual |
| **P2** | Degradação: lentidão, alerta intermitente, 1 máquina Fly fora, SSE caindo pra polling | agir no mesmo dia |
| **P3** | Cosmético, erro isolado sem impacto no pedido | backlog |

## Fallback manual (P1 sem solução rápida)

1. Plantonista avisa operador Cabanhas por WhatsApp.
2. Operador recebe pedidos direto pelo WhatsApp do restaurante (fluxo pré-Molho).
3. Plantonista comunica previsão de retorno.
4. Registrar o incidente (ver abaixo) e o intervalo de indisponibilidade.

## Runbook (ações de recuperação)

| Situação | Ação |
|---|---|
| Deploy ruim na API | `fly releases -a molho-api` → `fly deploy -a molho-api --image <release-anterior>` (rollback de imagem) |
| Deploy ruim num front | Vercel → Deployments → deployment anterior → **Promote to Production** |
| 1 máquina Fly não-ready | `fly machine restart <id> -a molho-api`; Fly já tira da rotação sozinha via check `/ready` |
| Banco corrompido / dado perdido | restaurar do dump noturno em `s3://molho-backups/` para uma branch Neon nova, validar, então repontar `DATABASE_URL` |
| Redis fora | Upstash console → status; se instância morta, criar nova e trocar `REDIS_URL` secret + `fly deploy` |
| Dispositivo de impressão comprometido | backoffice → Impressão → revogar dispositivo (efeito imediato); parear de novo |
| Agente de impressão parado | verificar processo no PC da loja; reiniciar; conferir estado "credencial revogada" |

## Registro de incidente

Um arquivo por incidente em `docs/go-live/incidentes/AAAA-MM-DD-<slug>.md` com: início, fim,
severidade, sintoma, causa provável, ação, evidência (sem PII), item de acompanhamento.

## O que o plantonista precisa ter à mão

- acesso admin a Fly, Vercel, Neon, Upstash, Cloudflare R2, Sentry;
- acesso ao backoffice como owner do Cabanhas (para revogar dispositivo, ver gestor);
- `fly` CLI autenticado;
- localização do dump noturno e o procedimento de restore testado (evidência de `NG-10`).
