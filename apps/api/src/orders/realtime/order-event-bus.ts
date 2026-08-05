import type Redis from 'ioredis';

/**
 * Payload MAGRO de propósito (CLAUDE.md/desenho do Épico 9): só o cutuque, nunca
 * o dado do pedido. O cliente recebe isto e faz um `GET` REST normal, que passa
 * pela RLS do Postgres — o pub/sub nunca é a última linha de autorização. Se um
 * bug de fan-out empurrasse um id errado, o fetch subsequente bateria na RLS e
 * negaria.
 */
export interface OrderEvent {
  orderId: string;
  // `payment_confirmed` é EIXO SEPARADO de `status_changed` de propósito:
  // paymentStatus é ortogonal a OrderStatus (docs/02 §5.5). Confirmar pagamento
  // NÃO move o status do pedido — reusar `status_changed` mentiria sobre qual
  // eixo mudou pra qualquer consumidor que ramifique por tipo (ex.: o
  // acompanhamento do cliente, Épico 12). O cutuque continua magro: o cliente
  // refaz o GET REST de qualquer forma.
  event: 'new' | 'status_changed' | 'payment_confirmed';
  version: number;
}

/**
 * Observabilidade do teste de pub/sub cross-instância (Épico 9). DESLIGADA por
 * default: sem a env, nada de `hello`, nada de `_via` — contrato de produção
 * idêntico. Env lida a cada uso (não no load do módulo) pra teste ligar/desligar
 * sem remontar o módulo.
 */
export function pubsubDebugEnabled(): boolean {
  return Boolean(process.env.MOLHO_DEBUG_PUBSUB);
}

/** Identidade da instância — `local` fora da Fly. Nunca contém dado de pedido. */
export function machineId(): string {
  return process.env.FLY_MACHINE_ID ?? 'local';
}

/** `merchant.{tenantId}.orders` — tenantId é uuid (sem pontos), então o split de volta é seguro. */
function channel(tenantId: string): string {
  return `merchant.${tenantId}.orders`;
}
const CHANNEL_PATTERN = 'merchant.*.orders';

function tenantIdFromChannel(ch: string): string | null {
  const parts = ch.split('.');
  return parts.length === 3 && parts[0] === 'merchant' && parts[2] === 'orders' ? (parts[1] ?? null) : null;
}

type Deliver = (event: OrderEvent) => void;
interface LocalSubscriber {
  /** Tenant AUTORIZADO no handshake do SSE, congelado no servidor — nunca vindo do cliente. */
  tenantId: string;
  deliver: Deliver;
}

/**
 * Registro de streams SSE locais (uma instância) + despacho FILTRADO POR TENANT.
 *
 * É aqui que a garantia de isolamento do desenho do Épico 9 vive: um evento do
 * tenant T só é entregue aos subscribers cujo `tenantId` (congelado no handshake)
 * === T. O nome do canal é só transporte; a autorização é esta comparação
 * server-side no ATO da entrega — réplica, na borda realtime, do que a RLS faz
 * no banco.
 */
export class OrderEventHub {
  private readonly subscribers = new Set<LocalSubscriber>();

  subscribe(tenantId: string, deliver: Deliver): () => void {
    const sub: LocalSubscriber = { tenantId, deliver };
    this.subscribers.add(sub);
    return () => this.subscribers.delete(sub);
  }

  dispatch(tenantId: string, event: OrderEvent): void {
    for (const sub of this.subscribers) {
      if (sub.tenantId === tenantId) sub.deliver(event);
    }
  }

  get size(): number {
    return this.subscribers.size;
  }
}

/**
 * Publica um evento pro tenant (chega a TODOS os subscribers locais desse tenant,
 * em TODAS as instâncias) e registra streams SSE locais. Duas implementações:
 * Redis pub/sub (produção multi-instância) e in-memory (dev/test, uma instância).
 */
export interface OrderEventBus {
  publish(tenantId: string, event: OrderEvent): Promise<void>;
  subscribe(tenantId: string, deliver: Deliver): () => void;
}

/**
 * Sem Redis: publish despacha direto no hub local (única instância). Mesmo
 * contrato do Redis, sem fan-out entre processos — cobre dev/test.
 */
export class InMemoryOrderEventBus implements OrderEventBus {
  private readonly hub = new OrderEventHub();

  async publish(tenantId: string, event: OrderEvent): Promise<void> {
    this.hub.dispatch(tenantId, event);
  }

  subscribe(tenantId: string, deliver: Deliver): () => void {
    return this.hub.subscribe(tenantId, deliver);
  }
}

/**
 * Fan-out multi-instância via Redis pub/sub (Upstash). `publish` empurra pro
 * canal do tenant; uma conexão dedicada de subscriber faz `psubscribe` no
 * padrão e, a cada mensagem, despacha no hub LOCAL desta instância — filtrado
 * por tenant pelo próprio hub.
 *
 * SEM REPLAY (desenho do Épico 9): pub/sub não guarda histórico. Mensagem
 * publicada enquanto esta instância estava desconectada se PERDE — e tudo bem:
 * o banco é a fonte da verdade, e a reconexão do cliente refaz o fetch REST dos
 * pedidos abertos (o `Last-Event-ID` é passado por conformidade de protocolo,
 * não garante nada). O gap é coberto pelo diff de ids no cliente.
 *
 * Exige DUAS conexões: `pub` (comandos normais) e `sub` (uma conexão em modo
 * subscriber não aceita outros comandos — regra do protocolo Redis).
 */
export class RedisOrderEventBus implements OrderEventBus {
  private readonly hub = new OrderEventHub();
  private subscribed = false;

  constructor(
    private readonly pub: Redis,
    private readonly sub: Redis,
  ) {}

  private ensureSubscribed(): void {
    if (this.subscribed) return;
    this.subscribed = true;
    void this.sub.psubscribe(CHANNEL_PATTERN);
    this.sub.on('pmessage', (_pattern, ch, message) => {
      const tenantId = tenantIdFromChannel(ch);
      if (!tenantId) return;
      let event: OrderEvent;
      try {
        event = JSON.parse(message) as OrderEvent;
      } catch {
        return; // mensagem malformada no canal — ignora, nunca derruba o dispatcher
      }
      this.hub.dispatch(tenantId, event);
    });
  }

  async publish(tenantId: string, event: OrderEvent): Promise<void> {
    // `_via` carimba a instância que ORIGINA o evento, ANTES de entrar no canal —
    // é o que prova fan-out cross-instância (evento publicado em A chega em B
    // carregando `_via=A`). Carimbar na ENTREGA mostraria sempre a máquina local
    // e não provaria nada. Só o id da máquina: nunca payload de pedido (PII).
    const payload = pubsubDebugEnabled() ? { ...event, _via: machineId() } : event;
    await this.pub.publish(channel(tenantId), JSON.stringify(payload));
  }

  subscribe(tenantId: string, deliver: Deliver): () => void {
    this.ensureSubscribed();
    return this.hub.subscribe(tenantId, deliver);
  }
}
