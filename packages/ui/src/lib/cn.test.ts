import { describe, expect, it } from 'vitest';
import { cn } from './cn';

/**
 * Regressão do bug mais caro que tivemos até aqui: o tailwind-merge tratava a
 * escala tipográfica do Tempero como se fosse cor e engolia a classe de cor do
 * texto. O botão primário do tema Grafite ficava preto sobre preto (1:1) — e
 * nenhum teste de unidade ou de axe pegava, porque o DOM estava "correto";
 * quem estava errado era a classe que sobrevivia ao merge.
 */
describe('cn — tamanho de fonte e cor não são a mesma coisa', () => {
  const TAMANHOS = [
    'text-display-lg',
    'text-display',
    'text-title-lg',
    'text-title',
    'text-body-lg',
    'text-body',
    'text-body-strong',
    'text-caption',
    'text-overline',
  ];

  it.each(TAMANHOS)('%s convive com uma cor de texto sem se anular', (tamanho) => {
    const resultado = cn('text-on-brand', tamanho);

    expect(resultado).toContain('text-on-brand');
    expect(resultado).toContain(tamanho);
  });

  it('o botão primário mantém fundo E cor de texto após o merge', () => {
    const resultado = cn('bg-brand text-on-brand', 'px-6 text-body-strong');

    expect(resultado).toContain('bg-brand');
    expect(resultado).toContain('text-on-brand');
    expect(resultado).toContain('text-body-strong');
  });

  it('cor de texto continua sendo sobrescrita por outra cor (a última vence)', () => {
    expect(cn('text-on-brand', 'text-critical')).toBe('text-critical');
    expect(cn('text-text-muted', 'text-brand-strong')).toBe('text-brand-strong');
  });

  it('tamanho de fonte continua sendo sobrescrito por outro tamanho', () => {
    expect(cn('text-body', 'text-title')).toBe('text-title');
  });

  it('ainda resolve conflitos normais do Tailwind', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6');
    expect(cn('bg-brand', 'bg-critical')).toBe('bg-critical');
  });
});
