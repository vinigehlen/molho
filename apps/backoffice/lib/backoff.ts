const BASE_MS = 1000;
const CAP_MS = 30000;

/**
 * Delay de reconexão do stream: backoff exponencial com FULL JITTER —
 * `random(0, min(cap, base·2^tentativa))`. O jitter (aleatório de 0 até o teto)
 * é o que evita a tempestade de reconexão: sem ele, todos os clientes que
 * caíram juntos (ex.: um deploy) reconectam no mesmo instante e batem no Neon
 * frio de novo (P2028, docs/07). Não usamos o auto-reconnect nativo do
 * EventSource (fixo ~3s, sem jitter) — fechamos e reconectamos com isto.
 *
 * `rng` injetável só pra teste ser determinístico (default Math.random —
 * jitter não é segurança, pode ser Math.random).
 */
export function nextBackoffDelay(attempt: number, rng: () => number = Math.random): number {
  const ceiling = Math.min(CAP_MS, BASE_MS * 2 ** Math.max(0, attempt));
  return Math.floor(rng() * ceiling);
}

/** Reconexão IMEDIATA porém jittered (server_shutdown do rolling deploy) — não empilha todo mundo na máquina que subiu primeiro. */
export function immediateJitter(rng: () => number = Math.random): number {
  return Math.floor(rng() * BASE_MS);
}
