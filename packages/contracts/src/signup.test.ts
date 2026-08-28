import { describe, expect, it } from 'vitest';
import { slugifyStoreName } from './signup';

describe('slugifyStoreName', () => {
  it('normaliza acento, espaço e caixa: "Cabanhas BBQ" -> cabanhas-bbq', () => {
    expect(slugifyStoreName('Cabanhas BBQ')).toBe('cabanhas-bbq');
  });

  it('remove acentos preservando as letras (NFD)', () => {
    expect(slugifyStoreName('Açaí & Cia São João')).toBe('acai-cia-sao-joao');
  });

  it('colapsa símbolos e espaços consecutivos num único hífen', () => {
    expect(slugifyStoreName('Pizza!!!   da   Esquina###')).toBe('pizza-da-esquina');
  });

  it('tira hífen das pontas', () => {
    expect(slugifyStoreName('  -Trailer do Zé-  ')).toBe('trailer-do-ze');
  });

  it('string vazia ou só-símbolo vira slug vazio (fallback é decisão do backend)', () => {
    expect(slugifyStoreName('')).toBe('');
    expect(slugifyStoreName('!!!')).toBe('');
    expect(slugifyStoreName('   ')).toBe('');
  });
});
