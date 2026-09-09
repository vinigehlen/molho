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

  it('destrava tocando um pulso e o beep vira um toque de telefone (3 repiques, bitom)', () => {
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
          start: (at: number) => calls.push(`start:${at}`),
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

    expect(calls).toEqual([
      // unlock(): pulso curto de destrave
      'resume',
      'start:10',
      'stop:11',
      // beep(): toque de telefone — 3 repiques, cada um com bitom (2 osciladores)
      'resume',
      'start:10',
      'stop:11',
      'start:10',
      'stop:11',
      'start:11.5',
      'stop:12.5',
      'start:11.5',
      'stop:12.5',
      'start:13',
      'stop:14',
      'start:13',
      'stop:14',
    ]);
    Object.defineProperty(window, 'AudioContext', { configurable: true, value: previous });
  });
});
