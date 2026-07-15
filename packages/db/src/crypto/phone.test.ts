import { beforeEach, describe, expect, it } from 'vitest';
import { decryptPhone, encryptPhone, hashPhoneForLookup } from './phone';

const TEST_KEY = Buffer.alloc(32, 7).toString('base64');

beforeEach(() => {
  process.env.MOLHO_ENCRYPTION_KEYS = JSON.stringify({ '1': TEST_KEY, '2': TEST_KEY });
});

describe('encryptPhone / decryptPhone', () => {
  it('cifra e decifra de volta pro mesmo telefone', () => {
    const { ciphertext, keyVersion } = encryptPhone('+5551999990000');
    expect(decryptPhone(ciphertext, keyVersion)).toBe('+5551999990000');
  });

  it('duas cifras do mesmo telefone dão ciphertexts diferentes (IV aleatório)', () => {
    const a = encryptPhone('+5551999990000');
    const b = encryptPhone('+5551999990000');
    expect(a.ciphertext.equals(b.ciphertext)).toBe(false);
  });

  it('usa a versão de chave pedida e devolve ela no resultado', () => {
    const { keyVersion } = encryptPhone('+5551999990000', '2');
    expect(keyVersion).toBe(2);
  });

  it('sem MOLHO_ENCRYPTION_KEYS configurada, lança em vez de cifrar em claro', () => {
    delete process.env.MOLHO_ENCRYPTION_KEYS;
    expect(() => encryptPhone('+5551999990000')).toThrow(/MOLHO_ENCRYPTION_KEYS/);
  });
});

describe('hashPhoneForLookup', () => {
  it('é determinístico — mesmo telefone, mesmo hash (é o que sustenta a busca por OTP)', () => {
    expect(hashPhoneForLookup('+5551999990000')).toBe(hashPhoneForLookup('+5551999990000'));
  });

  it('telefones diferentes dão hashes diferentes', () => {
    expect(hashPhoneForLookup('+5551999990000')).not.toBe(hashPhoneForLookup('+5551988880000'));
  });
});
