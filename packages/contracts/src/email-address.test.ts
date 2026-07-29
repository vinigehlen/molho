import { describe, expect, it } from 'vitest';
import { EmailAddressError, parseEmail, tryParseEmail } from './email-address';

describe('parseEmail', () => {
  it('normaliza trim + lowercase (é a chave do desafio/rate limit do OTP)', () => {
    expect(parseEmail('  Ana@Loja.COM ')).toBe('ana@loja.com');
  });

  it('aceita "+" e subdomínio', () => {
    expect(parseEmail('ana+pedido@mail.loja.com.br')).toBe('ana+pedido@mail.loja.com.br');
  });

  it.each([
    ['sem arroba', 'analoja.com'],
    ['nada antes do @', '@loja.com'],
    ['domínio sem ponto', 'ana@localhost'],
    ['domínio terminando em ponto', 'ana@loja.'],
    ['com espaço', 'ana @loja.com'],
    ['vazio', '   '],
  ])('rejeita %s', (_caso, raw) => {
    expect(() => parseEmail(raw)).toThrow(EmailAddressError);
  });

  it('tryParseEmail devolve null em vez de lançar', () => {
    expect(tryParseEmail('nope')).toBeNull();
    expect(tryParseEmail('ana@loja.com')).toBe('ana@loja.com');
  });
});
