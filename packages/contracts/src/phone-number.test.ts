import { describe, expect, it } from 'vitest';
import {
  PhoneNumberError,
  parsePhoneNumber,
  phoneNumberToDisplay,
  phoneNumberToE164,
  tryParsePhoneNumber,
} from './phone-number';

describe('parsePhoneNumber', () => {
  it('aceita E.164 já pronto', () => {
    expect(parsePhoneNumber('+5551999990000')).toBe('+5551999990000');
  });

  it('aceita formato com parênteses/traço', () => {
    expect(parsePhoneNumber('(51) 99999-0000')).toBe('+5551999990000');
  });

  it('aceita só dígitos sem código de país', () => {
    expect(parsePhoneNumber('51999990000')).toBe('+5551999990000');
  });

  it('aceita dígitos com código de país sem "+"', () => {
    expect(parsePhoneNumber('5551999990000')).toBe('+5551999990000');
  });

  it('recusa DDD inexistente no plano de numeração', () => {
    expect(() => parsePhoneNumber('+5520999990000')).toThrow(PhoneNumberError);
    expect(() => parsePhoneNumber('+5590999990000')).toThrow(PhoneNumberError);
  });

  it('recusa celular sem o nono dígito (não começa com 9)', () => {
    expect(() => parsePhoneNumber('+5551899990000')).toThrow(/nono dígito/);
  });

  it('recusa número curto ou longo demais', () => {
    expect(() => parsePhoneNumber('+555199999000')).toThrow(PhoneNumberError); // 10 dígitos nacionais
    expect(() => parsePhoneNumber('+55519999900000')).toThrow(PhoneNumberError); // 12 dígitos nacionais
  });

  it('aceita DDDs de todas as regiões (amostra)', () => {
    for (const ddd of ['11', '21', '31', '41', '51', '61', '71', '81', '91']) {
      expect(() => parsePhoneNumber(`+55${ddd}999990000`)).not.toThrow();
    }
  });
});

describe('tryParsePhoneNumber', () => {
  it('devolve null em vez de lançar', () => {
    expect(tryParsePhoneNumber('não é telefone')).toBeNull();
    expect(tryParsePhoneNumber('+5551999990000')).toBe('+5551999990000');
  });
});

describe('phoneNumberToDisplay', () => {
  it('formata pro padrão brasileiro de exibição', () => {
    const phone = parsePhoneNumber('+5551999990000');
    expect(phoneNumberToDisplay(phone)).toBe('(51) 99999-0000');
  });
});

describe('phoneNumberToE164', () => {
  it('devolve o E.164 canônico', () => {
    const phone = parsePhoneNumber('(51) 99999-0000');
    expect(phoneNumberToE164(phone)).toBe('+5551999990000');
  });
});
