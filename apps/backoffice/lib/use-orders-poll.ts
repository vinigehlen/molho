import { useEffect, useRef } from 'react';
import type { StreamStatus } from './use-orders-stream';

/** Intervalo do polling degradado. Frouxo de propósito: é rede de segurança
 *  para quando o SSE não conecta (proxy que corta stream, origem fora da
 *  allowlist CORS de um preview), não o caminho quente. */
export const DEGRADED_POLL_INTERVAL_MS = 15_000;

/**
 * O board está no modo degradado (precisa de polling) quando: já há um tenant,
 * o SSE não está `open` e a API REST está alcançável. Sem tenant não há o que
 * pedir; stream `open` já entrega tempo real; REST inalcançável é "sem conexão"
 * (fila offline + aviso), não um caso de polling. Puro e testável.
 */
export function isBoardDegraded(
  tenantId: string | null,
  streamStatus: StreamStatus,
  online: boolean,
): boolean {
  return tenantId !== null && streamStatus !== 'open' && online;
}

/**
 * Polling de fallback do board do gestor (Épico 9c, item 6 da fronteira).
 *
 * O caminho normal é o SSE (`useOrdersStream`): cutuque → refetch pontual. Mas
 * quando o stream NÃO conecta e a API REST continua alcançável — o caso de um
 * preview cuja origem não está na allowlist CORS, ou um proxy que mata SSE — o
 * board carregava uma vez e congelava até refresh manual. Aqui ele passa a
 * refazer o load completo a cada `DEGRADED_POLL_INTERVAL_MS` enquanto está
 * degradado.
 *
 * Só roda quando: há tenant, o stream está fora de `open` e o REST está
 * alcançável (`online`). Stream volta a `open` ou REST cai → o intervalo é
 * limpo (quando o REST cai, quem manda no board é a fila offline + o aviso de
 * "sem conexão", não este polling).
 */
export function useOrdersPoll(params: {
  tenantId: string | null;
  streamStatus: StreamStatus;
  online: boolean;
  reload: () => void | Promise<void>;
  intervalMs?: number;
}): void {
  const { tenantId, streamStatus, online, reload, intervalMs = DEGRADED_POLL_INTERVAL_MS } = params;
  const degraded = isBoardDegraded(tenantId, streamStatus, online);

  // `reload` é recriado a cada render do caller; guardá-lo num ref deixa o
  // efeito depender só do gate (`degraded`/`intervalMs`) sem reiniciar o
  // intervalo a cada render.
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  });

  useEffect(() => {
    if (!degraded) return undefined;
    const id = setInterval(() => void reloadRef.current(), intervalMs);
    return () => clearInterval(id);
  }, [degraded, intervalMs]);
}
