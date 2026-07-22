import { describe, expect, it } from 'vitest';
import { formatarHorarioCurto } from './format-horario';

describe('formatarHorarioCurto', () => {
  it('hora cheia: "12h", sem minutos', () => {
    expect(formatarHorarioCurto('2026-07-22T12:00:00-03:00')).toBe('12h');
  });

  it('com minutos: "18h30"', () => {
    expect(formatarHorarioCurto('2026-07-21T18:30:00-03:00')).toBe('18h30');
  });

  it('string inválida: devolve vazio, nunca lança', () => {
    expect(formatarHorarioCurto('não é uma data')).toBe('');
  });
});
