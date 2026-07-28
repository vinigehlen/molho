# 05 (anexo) — Infra: tetos de free tier, consumo e CUSTO FIXO mensal

Companheiro de `docs/05-unit-economics.xlsx` (a planilha é binária; esta conta em
prosa fica versionável no git). Registrado no Épico 9c ao confirmar o Upstash.

## Upstash Redis — Free Tier

**Limites (plano atual, `great-worm-158188`, `aws-sa-east-1`, Global):** 500 mil
comandos/mês · 256 MB · 10 GB banda/mês.

### Achado que muda a análise: publishes de pedido são a MENOR parte
O item nomeado como preocupação (publishes de `order_new`/`status_changed`/
`payment_confirmed`) é **~6 comandos por pedido** — fração pequena. Os termos que
DOMINAM o consumo não foram nomeados e precisam entrar na conta:

| Fonte | Comandos Redis | Por quê |
|---|---|---|
| **Rate-limit do storefront** | **~4 por request PÚBLICA** | `RedisSlidingWindowRateLimiter` roda um `MULTI` de `zremrangebyscore`+`zadd`+`zcard`+`expire` a cada request de cliente (navegar menu, produto, carrinho, `/checkout/revalidate`). Cliente navega muito antes de 1 pedido. **Maior termo.** |
| **Auth por request** | **1 GET por request AUTENTICADA** | `RedisUserVersionCache.get` (no `verifyAccessToken` de todo request de staff) é um GET no Redis — o cache é NO Redis, não em processo. O board é realtime: cada cutuque → refetch autenticado → 1 GET. |
| **Refresh token** | ~3–4 por refresh | `refreshLookupStore` + rotação de sessão + versão, a cada ~15min por aba aberta. |
| **Pub/sub publishes** | ~6 por pedido | 1 `order_new` + ~4 `status_changed` + 1 `payment_confirmed`. |
| **OTP / sessão** | poucos por login | Desprezível (login 1×/dia/staff). |

### Estimativa do piloto (premissas explícitas — ajustar aos números reais)
- ~5 lojas × ~1.500 pedidos/mês = **~7.500 pedidos/mês**.
- ~3 abas do gestor por loja no turno; ~15 requests públicas de cliente por pedido colocado.

Comandos/mês (ordem de grandeza):
- Storefront rate-limit: 4 × 15 × 7.500 ≈ **450 mil** ← domina
- Auth por request (staff): ~25 requests autenticadas/pedido × 7.500 ≈ **190 mil**
- Refresh: ~48 refresh/dia × 15 abas × 30 × 3,5 ≈ **75 mil**
- Publishes: 6 × 7.500 ≈ **45 mil**
- **Total ≈ 760 mil/mês** — **já ESTOURA os 500 mil** a ~7.500 pedidos.

### O free tier NÃO é gatilho de upgrade — é custo fixo desde o dia 1
Reenquadre (não tratar como contingência): o **ICP fatura R$ 40–150 mil/mês**; com
ticket ~R$ 50 isso é **800 a 3.000 pedidos/mês POR restaurante**. Ao ~100 comandos/pedido
efetivos do modelo acima, **um ÚNICO restaurante ativo** já gera ~80 mil–300 mil comandos/mês
— e o **segundo** estoura os 500 mil. O free tier não sobrevive ao primeiro par de clientes
reais. Logo: o Upstash entra como **plano pago fixo desde o go-live** (~US$ 10/mês,
Pay-as-you-go/fixed), não "quando o dashboard acender". O dashboard de comandos vira
monitoramento de custo variável, não gatilho binário.
(Incertezas que só PIORAM a conta, confirmar nos docs do Upstash: (a) comando dentro de
`MULTI` conta separado? (b) entrega pub/sub por subscriber conta? — empurram o custo pra cima,
nunca pra baixo.)

### Custo fixo mensal de infra e break-even (entrada de unit economics)
Câmbio assumido ~R$ 5,40/US$. Números a confirmar no faturamento real de cada serviço.

| Serviço | Config | US$/mês | ~R$/mês |
|---|---|--:|--:|
| **Fly.io** | 2× `shared-cpu-1x` 512MB, GRU, sempre ligadas | ~8 | ~43 |
| **Neon** | projeto de prod (Launch — free tier NÃO serve: API sempre-ligada mantém o compute ativo, estoura as compute-hours do free) | ~19 | ~103 |
| **Upstash** | plano pago desde o dia 1 (ver acima) | ~10 | ~54 |
| **Núcleo (os 3)** | | **~37** | **~200** |
| Vercel (à parte) | Pro exigido p/ uso comercial (Hobby proíbe) | ~20 | ~108 |

**Break-even do núcleo (~R$ 200/mês) no plano Standard (R$ 99/tenant/mês):**
**~2–3 tenants pagantes cobrem TODA a infra de núcleo** (2 tenants = R$ 198 ≈ empata;
3 = R$ 297 folga). Somando a Vercel Pro (~R$ 308/mês total), são **~4 tenants Standard**.
Ou seja: a partir de ~3–4 restaurantes no Standard, a infra é ruído no P&L — o risco de
custo do piloto não está na infra, está no CAC/suporte.

**Mitigações (otimização FUTURA — NÃO implementar agora, o custo não justifica):** (1) o
rate-limit do storefront é o maior termo de comandos — janela FIXA (1–2 comandos) ou só sob
volume suspeito cortaria o dominante; (2) L1 em processo (TTL curto) no `UserVersionCache`
reduz os GETs por request. Registrado pra quando o volume/custo justificar, não antes.

### Conexões concorrentes (teto a CONFIRMAR no console)
A API abre ~5 conexões persistentes por instância (cada módulo faz seu `new Redis`:
storefront, token, otp + `pub`/`sub` do event bus). Com 2 máquinas = **~10 conexões**.
Folgado pra qualquer teto plausível, mas o **limite do free tier precisa ser LIDO no
console, não presumido** (historicamente ~100 no free). Nota: os módulos não
compartilham um client — se o nº de instâncias crescer, as conexões crescem linear.

### Global vs Regional — recomendação (não executar)
O banco está como **Global** (primária de escrita + réplicas de leitura; cada escrita
replicada conta como comando). Com **uma região só**, não há réplica → sem
multiplicação hoje.
- **(a) pub/sub igual em Global e Regional?** Com região única, sim — medido ~79ms de
  fan-out (docs/07). Em Global MULTI-região o `PUBLISH` roteia pela primária e a
  entrega cross-região tem hop extra; **confirmar nos docs do Upstash** que a
  semântica de pub/sub não muda, já que o SSE do gestor depende dela. Não é problema
  hoje (região única), é cuidado se alguém adicionar região.
- **(b) Recomendação pro banco de PRODUÇÃO do piloto: trocar pra Regional.** A app é
  co-locada (Fly `gru` + Neon `sa-east-1`) e **não precisa de leitura multi-região** —
  Regional evita a multiplicação de comando por escrita replicada (à prova de futuro
  se adicionarem região), tem semântica de pub/sub mais simples, e custo igual/menor.
  O staging atual pode ficar Global (não churnar à toa). **Só a recomendação — não
  executado.**
