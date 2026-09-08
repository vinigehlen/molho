// Épico 9c §7.7 — prova de fan-out pub/sub cross-instância contra o staging real.
// NÃO é teste de CI (exige 2 máquinas Fly + Upstash real). Rodar à mão:
//   TOKEN='<access token de staff ou valor do cookie __Host-molho_stream>' node scripts/pubsub-crossinstance.mjs
// Opcional: CONNS=6 (nº de streams), SUBSCRIBE_ONLY=1 (só escuta, não publica —
// pra rodar numa 2ª máquina/IP enquanto a 1ª publica).
//
// Prova: uma conexão cujo `hello.machine` = X recebe um `order_status` com
// `_via` = Y != X. Isso só acontece se o evento atravessou o Redis pub/sub
// entre instâncias (MOLHO_DEBUG_PUBSUB carimba `hello` e `_via`, ver
// apps/api/src/orders/realtime/order-event-bus.ts).

import { setTimeout as delay } from 'node:timers/promises';
import { TextDecoder } from 'node:util';
import { Agent, fetch } from 'undici';

const API = process.env.API ?? 'https://api.staging.molho.live';
const TOKEN = process.env.TOKEN;
const CONNS = Number(process.env.CONNS ?? 6);
const SUBSCRIBE_ONLY = Boolean(process.env.SUBSCRIBE_ONLY);

if (!TOKEN) {
  console.error('falta TOKEN (access token de staff ou valor do cookie __Host-molho_stream)');
  process.exit(1);
}

const baseHeaders = { 'accept-encoding': 'identity' };
const authHeaders = { ...baseHeaders, authorization: `Bearer ${TOKEN}` };

// received -> preparing -> ready -> in_transit ; e o caminho de balcão/retirada.
// Só precisa de UMA transição válida pra frente pra disparar o evento.
const NEXT = { received: 'preparing', preparing: 'ready', ready: 'in_transit', in_transit: 'completed' };

async function resolveTenant() {
  const res = await fetch(`${API}/v1/me/sessions/tenants`, { headers: authHeaders });
  if (!res.ok) throw new Error(`/v1/me/sessions/tenants ${res.status} — token expirado? pega o cookie de novo`);
  const { tenants } = await res.json();
  if (!tenants?.length) throw new Error('nenhum tenant nos scopes do token');
  return tenants[0].id;
}

async function pickOrder(tenantId) {
  const res = await fetch(`${API}/v1/admin/orders`, { headers: { ...authHeaders, 'x-tenant-id': tenantId } });
  if (!res.ok) throw new Error(`GET /v1/admin/orders ${res.status}`);
  const orders = await res.json();
  const target = orders.find((o) => NEXT[o.status]);
  if (!target) throw new Error(`nenhum pedido ativo transicionável (status: ${orders.map((o) => o.status).join(', ') || 'vazio'})`);
  return target;
}

// Lê um stream SSE via fetch (EventSource não deixa mandar Cookie cross-origin).
async function openStream(tenantId, label, onEvent) {
  const res = await fetch(`${API}/v1/admin/orders/stream?tenant=${encodeURIComponent(tenantId)}`, {
    headers: { ...baseHeaders, accept: 'text/event-stream', cookie: `__Host-molho_stream=${TOKEN}` },
    // dispatcher próprio por stream: força TCP separado, senão o undici multiplexa
    // tudo numa conexão e a Fly manda todos os streams pra mesma máquina.
    dispatcher: new Agent({ connections: 1, pipelining: 0 }),
  });
  if (!res.ok || !res.body) throw new Error(`stream ${label}: ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  (async () => {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buf += decoder.decode(value, { stream: true });
      let sep;
      while ((sep = buf.indexOf('\n\n')) !== -1) {
        const raw = buf.slice(0, sep);
        buf = buf.slice(sep + 2);
        const evt = {};
        for (const line of raw.split('\n')) {
          const i = line.indexOf(':');
          if (i === -1) continue;
          const k = line.slice(0, i).trim();
          const v = line.slice(i + 1).trim();
          if (k === 'event') evt.event = v;
          if (k === 'data') evt.data = v;
        }
        if (evt.event && evt.event !== 'ping') onEvent(evt);
      }
    }
  })().catch((e) => console.error(`stream ${label} morreu:`, e.message));
  return reader;
}

const conns = [];

async function main() {
  const tenantId = await resolveTenant();
  console.log(`tenant: ${tenantId}`);

  for (let i = 0; i < CONNS; i++) {
    const c = { label: `#${i}`, machine: null, gotEvent: null };
    conns.push(c);
    await openStream(tenantId, c.label, (evt) => {
      let payload;
      try { payload = JSON.parse(evt.data); } catch { return; }
      if (evt.event === 'hello') {
        c.machine = payload.machine;
        console.log(`${c.label} hello  -> machine=${payload.machine} region=${payload.region}`);
      } else {
        c.gotEvent = payload;
        console.log(`${c.label} ${evt.event} -> _via=${payload._via ?? '(sem _via)'} version=${payload.version}`);
      }
    });
  }

  await delay(2500); // deixa os hellos chegarem

  const machines = [...new Set(conns.map((c) => c.machine).filter(Boolean))];
  console.log(`\nmáquinas servindo os ${CONNS} streams: ${machines.join(', ') || '(nenhum hello!)'}`);
  if (machines.length < 2 && !SUBSCRIBE_ONLY) {
    console.log('⚠ todos os streams caíram na MESMA máquina. Opções:');
    console.log('  a) roda de novo com CONNS=12');
    console.log('  b) truque: `fly scale count 1 -a molho-api-staging`, roda este script com SUBSCRIBE_ONLY=1,');
    console.log('     `fly scale count 2 -a molho-api-staging`, roda OUTRA instância deste script (que publica)');
    console.log('  c) roda este script em SUBSCRIBE_ONLY=1 numa máquina/IP diferente enquanto aqui publica');
  }

  if (SUBSCRIBE_ONLY) {
    console.log('\nSUBSCRIBE_ONLY: escutando. Dispara a transição do outro lado. Ctrl+C pra sair.');
    return;
  }

  const order = await pickOrder(tenantId);
  const toStatus = NEXT[order.status];
  console.log(`\npublicando: pedido ${order.id} ${order.status} -> ${toStatus} (version ${order.version})`);
  const res = await fetch(`${API}/v1/admin/orders/${order.id}/status`, {
    method: 'PATCH',
    headers: { ...authHeaders, 'x-tenant-id': tenantId, 'content-type': 'application/json' },
    body: JSON.stringify({ toStatus, version: order.version }),
  });
  if (res.status !== 204) throw new Error(`PATCH status ${res.status}: ${await res.text()}`);

  await delay(3000); // deixa o fan-out acontecer

  console.log('\n─── resultado ───');
  let crossInstance = false;
  for (const c of conns) {
    const got = c.gotEvent ? `_via=${c.gotEvent._via}` : 'NÃO RECEBEU';
    const cross = c.gotEvent && c.machine && c.gotEvent._via && c.gotEvent._via !== c.machine;
    if (cross) crossInstance = true;
    console.log(`${c.label} machine=${c.machine ?? '?'} ${got} ${cross ? '  <-- CROSS-INSTÂNCIA' : ''}`);
  }
  const allGot = conns.every((c) => c.gotEvent);
  console.log(`\ntodos os streams receberam o cutuque: ${allGot ? 'SIM' : 'NÃO'}`);
  console.log(`fan-out cross-instância provado: ${crossInstance ? 'SIM ✓' : 'NÃO (ver aviso de máquinas acima)'}`);
  process.exit(allGot && crossInstance ? 0 : 1);
}

main().catch((e) => { console.error('ERRO:', e.message); process.exit(1); });
