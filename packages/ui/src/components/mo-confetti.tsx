'use client';

import * as React from 'react';

const CORES = ['#D63A1E', '#F5A623', '#0D7F57', '#141216'];
const PARTICULAS = 24;

/** jsdom (ambiente de teste) não implementa `matchMedia` — trata como "sem preferência" em vez de derrubar o componente. */
function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export interface MoConfettiProps {
  /** Chamado quando a animação termina — pai decide se desmonta. */
  onDone?: () => void;
}

/**
 * Confete de "Publicar minha loja" (Épico 13, docs/03-self-setup.md §3) —
 * a ÚNICA assinatura de motion de celebração do produto (ver comentário em
 * tailwind-preset.ts). CSS puro, sem canvas nem lib nova: uma rajada de
 * `PARTICULAS` losangos caindo do topo, cada um com atraso/posição/cor
 * aleatórios pra não parecer uma grade repetida.
 *
 * Respeita `prefers-reduced-motion`: quem pediu menos movimento não vê a
 * rajada — só o resultado (a tela de compartilhamento por trás dela).
 */
export function MoConfetti({ onDone }: MoConfettiProps) {
  const particulas = React.useMemo(
    () =>
      Array.from({ length: PARTICULAS }, (_, i) => ({
        id: i,
        left: Math.random() * 100,
        delay: Math.random() * 0.3,
        cor: CORES[i % CORES.length],
      })),
    [],
  );

  const reducedMotion = prefersReducedMotion();

  React.useEffect(() => {
    if (reducedMotion) {
      onDone?.();
      return;
    }
    const timer = setTimeout(() => onDone?.(), 1700);
    return () => clearTimeout(timer);
  }, [onDone, reducedMotion]);

  if (reducedMotion) return null;

  return (
    <div className="pointer-events-none fixed inset-0 z-[60] overflow-hidden" aria-hidden="true">
      {particulas.map((p) => (
        <span
          key={p.id}
          className="absolute top-0 h-3 w-3 animate-confetti-fall rounded-sm"
          style={{ left: `${p.left}%`, backgroundColor: p.cor, animationDelay: `${p.delay}s` }}
        />
      ))}
    </div>
  );
}
