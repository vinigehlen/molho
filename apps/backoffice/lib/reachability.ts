import { useSyncExternalStore } from 'react';

/**
 * Alcançabilidade da API (última chamada REST bem-sucedida vs falha de REDE
 * real) — DIFERENTE do estado do stream SSE. Correção do Épico 9: stream caído
 * NÃO é sem conexão (pode ser proxy que corta stream, ou a janela de backoff),
 * enquanto o REST responde normal. Ação de dinheiro (marcar pago) e a fila
 * offline gateiam por ISTO, não por streamStatus.
 *
 * "Offline" = o `fetch` LANÇA (camada de rede). HTTP 4xx/5xx NÃO é offline — a
 * API está alcançável, só respondeu erro.
 */
let online = true;
const listeners = new Set<() => void>();

export function getReachability(): boolean {
  return online;
}

function setReachability(next: boolean): void {
  if (online === next) return;
  online = next;
  for (const fn of listeners) fn();
}

/** apiFetch chama isto: sucesso/HTTP-erro = online (API respondeu); throw de fetch = offline. */
export function markReachable(): void {
  setReachability(true);
}
export function markUnreachable(): void {
  setReachability(false);
}

export function useReachability(): boolean {
  return useSyncExternalStore(
    (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    getReachability,
    () => true, // SSR: assume online
  );
}
