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
 * Alerta de pedido novo via Web Audio — sem asset (ponytail), sem lib. Autoplay:
 * o browser bloqueia áudio até um gesto do usuário, então `unlock()` (chamado
 * no 1º clique) cria/retoma o AudioContext; `beep()` só soa depois disso.
 *
 * `beep()` toca um TOQUE DE TELEFONE: 3 repiques de ~1 s (bitom 440/480 Hz)
 * com pausa curta entre eles — ~4 s no total, pra puxar a atenção do balcão,
 * não um bip único que passa batido.
 */
export class Beeper {
  private ctx: AudioContext | null = null;

  /** No 1º gesto do usuário: destrava o áudio (AudioContext só inicia sob gesto). */
  unlock(): boolean {
    if (this.ctx) {
      void this.ctx.resume();
      return true;
    }
    if (typeof window === 'undefined') return false;
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    this.ctx = new Ctor();
    void this.ctx.resume();

    // Alguns navegadores só liberam o áudio se um nó tocar durante o gesto do clique.
    this.tone(0.01, 1);
    return true;
  }

  get unlocked(): boolean {
    return this.ctx !== null;
  }

  beep(): void {
    if (!this.ctx) return; // ainda não destravado — silêncio, não erro
    void this.ctx.resume();
    // Toque de telefone: 3 repiques de 1 s (bitom 440 + 480 Hz), pausa de 0,5 s.
    const burst = 1;
    const gap = 0.5;
    for (let i = 0; i < 3; i += 1) {
      const offset = i * (burst + gap);
      this.tone(0.16, burst, 440, offset);
      this.tone(0.16, burst, 480, offset);
    }
  }

  private tone(volume: number, durationSeconds: number, frequency = 880, startOffset = 0): void {
    if (!this.ctx) return;
    const startAt = this.ctx.currentTime + startOffset;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.frequency.value = frequency;
    gain.gain.value = volume;
    osc.connect(gain).connect(this.ctx.destination);
    osc.start(startAt);
    osc.stop(startAt + durationSeconds);
  }
}
