import { useEffect } from 'react';

/**
 * Mantém a tela acesa enquanto o gestor está aberto (Épico 9) — tablet no
 * balcão da cozinha não pode apagar e perder o board. Nativo (Screen Wake Lock
 * API), sem lib. O lock CAI quando a aba perde visibilidade, então re-pede no
 * `visibilitychange` ao voltar. Degrada em silêncio onde não há suporte
 * (navegador antigo / não-seguro) — não é erro, só não trava a tela.
 *
 * Limite conhecido (docs/07): NÃO cobre aba descartada pelo SO por pressão de
 * memória — só enquanto a aba está viva e visível. Web Push real fica pro 9b+.
 */
export function useWakeLock(enabled: boolean): void {
  useEffect(() => {
    if (!enabled || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;

    async function acquire() {
      try {
        sentinel = await navigator.wakeLock.request('screen');
      } catch {
        /* negado/não suportado — degrada sem travar a tela */
      }
    }
    function onVisibility() {
      if (document.visibilityState === 'visible' && !cancelled) void acquire();
    }

    void acquire();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisibility);
      void sentinel?.release();
    };
  }, [enabled]);
}
