import { useEffect, useRef, useState } from 'react';
import { armStream, streamUrl } from './api-client';
import { immediateJitter, nextBackoffDelay } from './backoff';

export type StreamStatus = 'connecting' | 'open' | 'reconnecting';

interface Nudge {
  orderId: string;
  event: 'new' | 'status_changed' | 'payment_confirmed';
  version: number;
}

interface Handlers {
  /** Cutuque do stream: o board refaz o GET REST deste pedido (RLS). */
  onNudge: (nudge: Nudge) => void;
  /** Renova a sessão; true reconecta e rearma o cookie, false encerra. */
  onExpired: () => boolean | Promise<boolean>;
}

/**
 * Consumidor SSE do gestor. arma o cookie → abre o EventSource → cutuques
 * viram callbacks. Reconexão é NOSSA (backoff+jitter), não o auto-reconnect
 * nativo (fixo, sem jitter): no `onerror` fechamos e reagendamos.
 *
 * - `order_new`/`order_status` → onNudge (board refaz o fetch).
 * - `server_shutdown` (rolling deploy) → reconecta JÁ, jittered (token ainda
 *   vale; migra pra outra máquina sem esperar timeout de TCP).
 * - `token_expired` → onExpired (sem refresh ainda — débito do 9b).
 * - `onerror` (queda de rede) → backoff exponencial + full jitter.
 */
export function useOrdersStream(tenantId: string | null, handlers: Handlers): StreamStatus {
  const [status, setStatus] = useState<StreamStatus>('connecting');
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!tenantId) return;
    let stopped = false;
    let es: EventSource | null = null;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function scheduleReconnect(immediate: boolean) {
      if (stopped) return;
      setStatus('reconnecting');
      const delay = immediate ? immediateJitter() : nextBackoffDelay(attempt++);
      timer = setTimeout(() => void connect(), delay);
    }

    async function connect() {
      if (stopped) return;
      setStatus(attempt === 0 ? 'connecting' : 'reconnecting');
      // arma o cookie de stream (falha aqui não é fatal — o EventSource vai
      // errar e cair no backoff, que re-arma na próxima tentativa)
      try {
        await armStream();
      } catch {
        /* segue — onerror trata */
      }
      if (stopped) return;

      const source = new EventSource(streamUrl(tenantId!), { withCredentials: true });
      es = source;

      source.onopen = () => {
        attempt = 0;
        setStatus('open');
      };
      const onNudge = (e: MessageEvent) => {
        try {
          handlersRef.current.onNudge(JSON.parse(e.data as string) as Nudge);
        } catch {
          /* payload malformado — ignora */
        }
      };
      source.addEventListener('order_new', onNudge);
      source.addEventListener('order_status', onNudge);
      // Confirmação de pagamento (eixo ortogonal ao status) — refetch idêntico:
      // o AdminOrder devolvido já traz o paymentStatus fresco pro board/painel.
      source.addEventListener('order_payment', onNudge);
      source.addEventListener('server_shutdown', () => {
        source.close();
        scheduleReconnect(true);
      });
      source.addEventListener('token_expired', () => {
        source.close();
        void Promise.resolve(handlersRef.current.onExpired()).then((renewed) => {
          if (renewed) {
            attempt = 0;
            scheduleReconnect(true);
          } else {
            stopped = true;
          }
        });
      });
      source.onerror = () => {
        source.close();
        scheduleReconnect(false);
      };
    }

    void connect();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      es?.close();
    };
  }, [tenantId]);

  return status;
}
