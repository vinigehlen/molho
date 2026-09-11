# Ata NG-01 — decisões e acessos (Plano Zero NO-GO)

**Data:** 2026-09-09  
**Atualização PM:** 2026-09-11 — PM assumiu `NG-01`, autorizou o foco no sistema
operacional completo do Cabanhas hoje e moveu Sentry/API completo para backlog futuro.
**Base:** `docs/14-plano-zero-no-go.md` §5 NG-01 · `docs/15-divisao-zero-no-go-codex-cc.md` §5 R0/C0
**Decisor:** Vinicius Gehlen (PM + responsável técnico + plantonista)
**Escopo:** decisões PM e acessos. Aceite jurídico e aceite do Cabanhas seguem pendentes (ver §4).

Sem segredos neste arquivo. Codex ratifica e marca a matriz central de `docs/14`.

---

## 1. Decisões travadas

| # | Item | Decisão | Impacto |
|---|---|---|---|
| 1 | Slug final | **`cabanhas-bbq`** (confirmado; já travado em doc 14 §2) | `NG-04`, `NG-15` |
| 2 | Domínio do piloto | **`cabanhas-bbq.molho.live`**, sem domínio próprio, cadastrado explícito na Vercel | `NG-02`, `NG-14` |
| 3 | `checkout.guest` | **Desligado** — checkout exige OTP (telefone/e-mail) | `NG-03` (Codex), `NG-15` |
| 4 | Pagamentos aceitos | **PIX estático** (chave do lojista, confirmação manual) · **dinheiro na entrega** · **cartão na entrega** (sem PSP) | `NG-15` |
| 5 | Plano Neon | **Free** + `pg_dump` noturno comprimido para `s3://molho-backups/`, retenção 30 dias, via cron. Aceito: cold start após ocioso (cliente refaz), history de restore ~6h. RPO ≤ 24h (último dump); RTO ~30 min (restore manual para branch nova). Branch produtiva protegida indisponível no Free — reavaliar ao trocar de plano | `NG-10`, `NG-05` |
| 6 | Domínio de assets | **`r2.dev` público** (`pub-<hash>.r2.dev`) no piloto — registrable domain isolado de `molho.live`, satisfaz a regra de origem separada (`docs/07`). Domínio de assets próprio fica **pós-piloto**. Flexibiliza o critério original de `NG-13` ("domínio próprio") — decisão PM explícita | `NG-13`, `NG-05` |
| 7 | Permissão de gestão de dispositivo de impressão | **Reusar `team.manage`** (owner/manager, já existe). Sem permissão nova, sem tocar contrato compartilhado `packages/contracts` | `NG-06` |
| 8 | Segurança / adapters | CSP em enforcement no backoffice após observação em staging; adapters mock/memória proibidos em produção (já em doc 14 §2) | `NG-05`, `NG-09` |
| 9 | Cabanhas | Tenant criado pelo fluxo real; nenhum seed/cliente/pedido/sessão de staging copiado (doc 14 §2) | `NG-15` |
| 10 | Data do dry run físico | **2026-09-11** (alvo; sujeito a disponibilidade do restaurante) | `NG-15` |
| 11 | Canal de incidente + fallback | Definido em `docs/go-live/plantao.md`: alerta → `superadmin.molho.live@gmail.com`; P1 → WhatsApp `51-99261-6964`; fallback manual = pedidos pelo WhatsApp do restaurante (fluxo pré-Molho) | `NG-08`, `NG-15` |
| 12 | Sentry da API no piloto | **Descopado.** Sentry não é dependência de boot; sem ele fica sem alerta de erro e sem agregação. Piloto de 1 restaurante aceita o risco. Fallback: `fly logs` + métricas Fly/Grafana + monitor de uptime externo no `/ready` (alerta pro canal de incidente da linha 11). Sentry da API entra pós-piloto. Flexibiliza o critério original de `NG-08` (Sentry + alertas reais na API) — decisão PM explícita, 2026-09-10 | `NG-08` |
| 13 | Prioridade do corte | **Sistema operacional completo do Cabanhas hoje**: cardápio para clientes, checkout, balcão/pedidos/gestão, WhatsApp, impressão e fallback. Site institucional `molho.live`/`www`, marketing e Sentry completo ficam pós-corte. | `NG-02`, `NG-03`, `NG-04`, `NG-09`, `NG-14`, `NG-15` |

## 2. Responsáveis

| Papel | Responsável | Contato | Estado |
|---|---|---|---|
| Responsável técnico | Vinicius Gehlen | `superadmin.molho.live@gmail.com` | ✅ |
| Plantonista (único, piloto) | Vinicius Gehlen | WhatsApp `51-99261-6964` · `superadmin.molho.live@gmail.com` | ✅ (`plantao.md`) |
| Jurídico | — | — | ⏳ pendente (revisão de termos, privacidade, DPA, subprocessadores, retenção, incidente) |
| Operador Cabanhas | — | — | ⏳ pendente (contato do restaurante; entra em `plantao.md` e aciona fallback manual) |

## 3. Acessos administrativos

Todos os serviços com acesso admin do PM. Neon e Vercel confirmados via MCP nesta sessão.

| Serviço | Uso | Estado |
|---|---|---|
| Vercel | fronts produtivos, promoção/rollback | ✅ |
| Fly.io | app `molho-api` em `gru`, secrets, certificado `api.molho.live` | ✅ |
| Neon | projeto produtivo `sa-east-1`, roles, restore drill | ✅ |
| Upstash | Redis produtivo São Paulo | ✅ |
| Cloudflare (DNS) | registros do piloto | ✅ |
| Cloudflare R2 | bucket produtivo, credencial, `molho-backups` | ✅ |
| Resend | domínio Verified, SPF/DKIM/return-path/DMARC | ✅ |
| Sentry | os 3 fronts (Codex). API **descopada no piloto** — ver §1 linha 12 | ✅ fronts / ⏭️ API pós-piloto |

**Nome de app Fly `molho-api`:** confirmar que está livre (nomes Fly são globais) antes do primeiro `fly apps create` — se tomado, PM define o nome.

## 4. Fechamento de `NG-01` e pendências movidas

`NG-01` fecha as **decisões PM e acessos** (§1–§3) e foi assumido pelo PM em 11/09/2026.
As pendências abaixo não bloqueiam mais `NG-01`; elas foram movidas para os gates
operacionais correspondentes:

- revisão jurídica ampla de termos, privacidade, DPA, subprocessadores, retenção e plano
  de incidente → pós-corte/`NG-14`;
- contato do operador Cabanhas nomeado e registrado em `plantao.md` → `NG-15`;
- aceite do Cabanhas para dados, cardápio, instruções de PIX, operação e teste físico →
  `NG-15`;
- Sentry/API e alertas completos → backlog futuro `NG-08`;
- nome Fly `molho-api` já usado no RC técnico da API.

## 5. Efeito no congelamento de contratos (doc 15 §4)

Com as decisões acima, os contratos da trilha CC (`docs/go-live/contratos-cc.md`) ficam prontos para o Codex congelar:

- Banco: `DATABASE_URL` pooled `app_runtime`, `DIRECT_URL` direta `app_migrator` — inalterado. Restauração = **Opção B (Free + dump noturno)**.
- Impressão: sem permissão nova — **`team.manage`**. Namespace do agente `/v1/printing/agent/*`, `PrintDeviceAuthGuard`, tabela `print_devices`.
- Assets: `S3_PUBLIC_URL = https://pub-<hash>.r2.dev`.
- Variável nova a introduzir: `MOLHO_PRINT_DEVICE_TOKEN` (agente). Resto de `NG-05` é passar a exigir/validar no boot, sem nome novo.
