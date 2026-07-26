/**
 * IDs presentes agora que NÃO estavam no conjunto conhecido. É o gatilho do som
 * (Épico 9, §c): "id de pedido nunca visto antes", não "chegou evento SSE" —
 * assim sobrevive à janela offline (§7): na reconexão, o refetch traz os
 * pedidos que chegaram no intervalo e o diff os pega, tocando o alerta. Puro.
 */
export function diffNewIds(seen: Set<string>, currentIds: string[]): string[] {
  return currentIds.filter((id) => !seen.has(id));
}

/**
 * Beep de pedido novo via Web Audio — sem asset (ponytail), sem lib. Autoplay:
 * o browser bloqueia áudio até um gesto do usuário, então `unlock()` (chamado
 * no 1º clique) cria/retoma o AudioContext; `beep()` só soa depois disso.
 */
export class Beeper {
  private ctx: AudioContext | null = null;

  /** No 1º gesto do usuário: destrava o áudio (AudioContext só inicia sob gesto). */
  unlock(): void {
    if (this.ctx) {
      void this.ctx.resume();
      return;
    }
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) this.ctx = new Ctor();
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  beep(): void {
    if (!this.ctx) return; // ainda não destravado — silêncio, não erro
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(this.ctx.destination);
    osc.start();
    osc.stop(this.ctx.currentTime + 0.2);
  }
}
