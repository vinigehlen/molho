import { beforeEach, describe, expect, it } from 'vitest';
import { decryptEmail, encryptEmail, hashEmailForLookup } from './email';

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');
const TEST_PEPPER = Buffer.alloc(32, 9).toString('base64');

beforeEach(() => {
  process.env.MOLHO_ENCRYPTION_KEYS = JSON.stringify({ '1': TEST_KEY });
  process.env.MOLHO_EMAIL_PEPPER = TEST_PEPPER;
});

describe('encryptEmail / decryptEmail', () => {
  it('cifra e decifra de volta pro mesmo e-mail', () => {
    const { ciphertext, keyVersion } = encryptEmail('ana@loja.com');
    expect(decryptEmail(ciphertext, keyVersion)).toBe('ana@loja.com');
  });

  it('duas cifras do mesmo e-mail dão ciphertexts diferentes (IV aleatório)', () => {
    expect(encryptEmail('ana@loja.com').ciphertext.equals(encryptEmail('ana@loja.com').ciphertext)).toBe(false);
  });
});

describe('hashEmailForLookup', () => {
  it('é determinístico — é o que sustenta a busca de identidade de staff', () => {
    expect(hashEmailForLookup('ana@loja.com')).toBe(hashEmailForLookup('ana@loja.com'));
  });

  it('e-mails diferentes dão hashes diferentes', () => {
    expect(hashEmailForLookup('ana@loja.com')).not.toBe(hashEmailForLookup('bia@loja.com'));
  });

  it('usa PEPPER PRÓPRIA — trocar só o pepper muda o hash (não é a chave de cifra)', () => {
    const comPepperA = hashEmailForLookup('ana@loja.com');
    process.env.MOLHO_EMAIL_PEPPER = Buffer.alloc(32, 3).toString('base64');
    expect(hashEmailForLookup('ana@loja.com')).not.toBe(comPepperA);
  });

  it('sem MOLHO_EMAIL_PEPPER, LANÇA (nunca hash sem pepper — cairia por dicionário)', () => {
    delete process.env.MOLHO_EMAIL_PEPPER;
    expect(() => hashEmailForLookup('ana@loja.com')).toThrow(/MOLHO_EMAIL_PEPPER/);
  });
});
