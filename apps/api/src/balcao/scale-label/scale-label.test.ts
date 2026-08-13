import { describe, expect, it } from 'vitest';
import { SCALE_PRESETS, parseScaleLabel, type ScalePreset } from './scale-label';

describe('parseScaleLabel', () => {
  it('parseia preset genérico em modo preço', () => {
    const barcode = ean13('200123400899');

    expect(parseScaleLabel(barcode, SCALE_PRESETS.generic)).toEqual({
      kind: 'price',
      itemCode: '01234',
      priceCents: 899,
    });
  });

  it('parseia preset Toledo em modo preço', () => {
    const barcode = ean13('210123400899');

    expect(parseScaleLabel(barcode, SCALE_PRESETS.toledo)).toEqual({
      kind: 'price',
      itemCode: '01234',
      priceCents: 899,
    });
  });

  it('parseia preset Filizola em modo peso', () => {
    const barcode = ean13('220004101250');

    expect(parseScaleLabel(barcode, SCALE_PRESETS.filizola)).toEqual({
      kind: 'weight',
      itemCode: '00041',
      weightGrams: 1250,
    });
  });

  it('parseia preset Prix com layout proprio em modo preço', () => {
    const barcode = ean13('230777001299');

    expect(parseScaleLabel(barcode, SCALE_PRESETS.prix)).toEqual({
      kind: 'price',
      itemCode: '0777',
      priceCents: 1299,
    });
  });

  it('extrai campos conforme o layout configurado, independente do nome do preset', () => {
    const preset: ScalePreset = {
      name: 'generic',
      mode: 'weight',
      itemCode: { start: 3, length: 3 },
      amount: { start: 6, length: 6 },
      variablePrefixPattern: /^2\d$/,
    };
    const barcode = ean13('251234056789');

    expect(parseScaleLabel(barcode, preset)).toEqual({
      kind: 'weight',
      itemCode: '234',
      weightGrams: 56_789,
    });
  });

  it('rejeita dígito verificador EAN-13 errado', () => {
    const valid = ean13('210123400899');
    const invalid = `${valid.slice(0, 12)}${valid[12] === '9' ? '0' : '9'}`;

    expect(parseScaleLabel(invalid, SCALE_PRESETS.toledo)).toEqual({
      kind: 'invalid',
      reason: 'invalid_check_digit',
    });
  });

  it('rejeita tamanho diferente de 13 dígitos', () => {
    expect(parseScaleLabel('210123400899', SCALE_PRESETS.toledo)).toEqual({
      kind: 'invalid',
      reason: 'invalid_length',
    });
  });

  it('rejeita caracteres não numéricos', () => {
    expect(parseScaleLabel('21012340089A7', SCALE_PRESETS.toledo)).toEqual({
      kind: 'invalid',
      reason: 'invalid_characters',
    });
  });

  it('rejeita prefixo que não é de item variável 2x', () => {
    const barcode = ean13('310123400899');

    expect(parseScaleLabel(barcode, SCALE_PRESETS.toledo)).toEqual({
      kind: 'invalid',
      reason: 'non_variable_prefix',
    });
  });

  it('aceita qualquer prefixo 2x como item variável', () => {
    const barcode = ean13('290123400899');

    expect(parseScaleLabel(barcode, SCALE_PRESETS.toledo)).toMatchObject({
      kind: 'price',
      itemCode: '01234',
      priceCents: 899,
    });
  });

  it('rejeita preset com layout fora do payload EAN-13', () => {
    const invalidPreset: ScalePreset = {
      name: 'toledo',
      mode: 'price',
      itemCode: { start: 2, length: 5 },
      amount: { start: 10, length: 3 },
      variablePrefixPattern: /^2\d$/,
    };

    expect(parseScaleLabel(ean13('210123400899'), invalidPreset)).toEqual({
      kind: 'invalid',
      reason: 'invalid_preset',
    });
  });
});

function ean13(payload: string): string {
  if (!/^\d{12}$/.test(payload)) throw new Error('payload precisa ter 12 dígitos');
  const digits = [...payload].map(Number);
  const sum = digits.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${payload}${checkDigit}`;
}
