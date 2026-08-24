import { describe, expect, it } from 'vitest';
import { Beeper, diffNewIds } from './order-sound';

describe('diffNewIds', () => {
  it('devolve só os ids ainda não vistos', () => {
    const seen = new Set(['a', 'b']);
    expect(diffNewIds(seen, ['a', 'b', 'c', 'd'])).toEqual(['c', 'd']);
  });

  it('nada novo → vazio (não toca)', () => {
    expect(diffNewIds(new Set(['a', 'b']), ['a', 'b'])).toEqual([]);
  });

  it('conjunto vazio (1º load ainda não semeado seria tratado à parte) → tudo é novo', () => {
    expect(diffNewIds(new Set(), ['a', 'b'])).toEqual(['a', 'b']);
  });

  it('id que sumiu do board não conta como novo (remoção não toca)', () => {
    expect(diffNewIds(new Set(['a', 'b']), ['a'])).toEqual([]);
  });
});

describe('Beeper', () => {
  it('não destrava quando o browser não oferece AudioContext', () => {
    const previous = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: undefined });
    Object.defineProperty(window, 'webkitAudioContext', { configurable: true, value: undefined });

    const beeper = new Beeper();
    expect(beeper.unlock()).toBe(false);
    expect(beeper.unlocked).toBe(false);

    Object.defineProperty(window, 'AudioContext', { configurable: true, value: previous });
  });

  it('destrava tocando um pulso e permite beep posterior', () => {
    const calls: string[] = [];
    class FakeAudioContext {
      currentTime = 10;
      destination = {};
      resume() {
        calls.push('resume');
        return Promise.resolve();
      }
      createOscillator() {
        return {
          frequency: { value: 0 },
          connect: () => ({ connect: () => undefined }),
          start: () => calls.push('start'),
          stop: (at: number) => calls.push(`stop:${at}`),
        };
      }
      createGain() {
        return { gain: { value: 0 }, connect: () => this.destination };
      }
    }
    const previous = window.AudioContext;
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: FakeAudioContext });

    const beeper = new Beeper();
    expect(beeper.unlock()).toBe(true);
    expect(beeper.unlocked).toBe(true);
    beeper.beep();

    expect(calls).toEqual(['resume', 'start', 'stop:11', 'resume', 'start', 'stop:10.2']);
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: previous });
  });
});
