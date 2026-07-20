import { describe, expect, it } from 'vitest';
import { resolvePublicImageUrl } from './public-url';

const BASE = 'https://pub-abc.r2.dev';

describe('resolvePublicImageUrl', () => {
  it('junta base e chave com exatamente uma barra', () => {
    expect(resolvePublicImageUrl('produtos/x-burger.jpg', BASE)).toBe('https://pub-abc.r2.dev/produtos/x-burger.jpg');
  });

  it('não duplica a barra quando a base termina em "/"', () => {
    expect(resolvePublicImageUrl('produtos/a.jpg', 'https://pub-abc.r2.dev/')).toBe(
      'https://pub-abc.r2.dev/produtos/a.jpg',
    );
  });

  it('não duplica a barra quando a chave começa com "/"', () => {
    expect(resolvePublicImageUrl('/produtos/a.jpg', BASE)).toBe('https://pub-abc.r2.dev/produtos/a.jpg');
  });

  it('devolve null para produto sem foto', () => {
    expect(resolvePublicImageUrl(null, BASE)).toBeNull();
  });

  it('devolve null quando S3_PUBLIC_URL não está configurada — placeholder em vez de imagem quebrada', () => {
    expect(resolvePublicImageUrl('produtos/a.jpg', undefined)).toBeNull();
    expect(resolvePublicImageUrl('produtos/a.jpg', '')).toBeNull();
    expect(resolvePublicImageUrl('produtos/a.jpg', '   ')).toBeNull();
  });
});
