export type ScaleLabelInvalidReason =
  | 'invalid_length'
  | 'invalid_characters'
  | 'invalid_check_digit'
  | 'non_variable_prefix'
  | 'invalid_preset';

export type ParsedScaleLabel =
  | { kind: 'price'; itemCode: string; priceCents: number }
  | { kind: 'weight'; itemCode: string; weightGrams: number }
  | { kind: 'invalid'; reason: ScaleLabelInvalidReason };

export type ScaleLabelMode = 'price' | 'weight';

export interface ScalePreset {
  name: 'toledo' | 'filizola' | 'prix' | 'generic';
  mode: ScaleLabelMode;
  itemCode: DigitSlice;
  amount: DigitSlice;
  variablePrefixPattern: RegExp;
}

interface DigitSlice {
  start: number;
  length: number;
}

const VARIABLE_ITEM_PREFIX = /^2\d$/;

// A CONFIRMAR contra etiqueta real — layout de dígitos é palpite até calibrar.
// A entrega desta fatia é o contrato do parser: receber um layout como config,
// validar EAN-13/prefixo variável e extrair campos conforme o preset recebido.
// Estes presets nomeados exercitam a mecânica e devem ser ajustados quando uma
// etiqueta Toledo/Filizola/Prix real estiver em mãos.
export const SCALE_PRESETS = {
  generic: {
    name: 'generic',
    mode: 'price',
    itemCode: { start: 2, length: 5 },
    amount: { start: 7, length: 5 },
    variablePrefixPattern: VARIABLE_ITEM_PREFIX,
  },
  toledo: {
    name: 'toledo',
    mode: 'price',
    itemCode: { start: 2, length: 5 },
    amount: { start: 7, length: 5 },
    variablePrefixPattern: VARIABLE_ITEM_PREFIX,
  },
  filizola: {
    name: 'filizola',
    mode: 'weight',
    itemCode: { start: 2, length: 5 },
    amount: { start: 7, length: 5 },
    variablePrefixPattern: VARIABLE_ITEM_PREFIX,
  },
  prix: {
    name: 'prix',
    mode: 'price',
    itemCode: { start: 2, length: 4 },
    amount: { start: 6, length: 6 },
    variablePrefixPattern: VARIABLE_ITEM_PREFIX,
  },
} satisfies Record<string, ScalePreset>;

export function parseScaleLabel(barcode: string, preset: ScalePreset): ParsedScaleLabel {
  if (!isValidPreset(preset)) return { kind: 'invalid', reason: 'invalid_preset' };
  if (barcode.length !== 13) return { kind: 'invalid', reason: 'invalid_length' };
  if (!/^\d+$/.test(barcode)) return { kind: 'invalid', reason: 'invalid_characters' };
  if (!hasValidEan13CheckDigit(barcode)) return { kind: 'invalid', reason: 'invalid_check_digit' };

  const prefix = barcode.slice(0, 2);
  if (!preset.variablePrefixPattern.test(prefix)) {
    return { kind: 'invalid', reason: 'non_variable_prefix' };
  }

  const itemCode = readSlice(barcode, preset.itemCode);
  const amount = Number(readSlice(barcode, preset.amount));

  if (preset.mode === 'price') {
    return { kind: 'price', itemCode, priceCents: amount };
  }
  return { kind: 'weight', itemCode, weightGrams: amount };
}

function isValidPreset(preset: ScalePreset): boolean {
  return (
    (preset.mode === 'price' || preset.mode === 'weight') &&
    fitsEanPayload(preset.itemCode) &&
    fitsEanPayload(preset.amount) &&
    !slicesOverlap(preset.itemCode, preset.amount)
  );
}

function fitsEanPayload(slice: DigitSlice): boolean {
  return Number.isInteger(slice.start) && Number.isInteger(slice.length) && slice.start >= 0 && slice.length > 0 && slice.start + slice.length <= 12;
}

function slicesOverlap(left: DigitSlice, right: DigitSlice): boolean {
  return left.start < right.start + right.length && right.start < left.start + left.length;
}

function readSlice(barcode: string, slice: DigitSlice): string {
  return barcode.slice(slice.start, slice.start + slice.length);
}

function hasValidEan13CheckDigit(barcode: string): boolean {
  const digits = [...barcode].map(Number);
  const payload = digits.slice(0, 12);
  const sum = payload.reduce((acc, digit, index) => acc + digit * (index % 2 === 0 ? 1 : 3), 0);
  const expected = (10 - (sum % 10)) % 10;
  return digits[12] === expected;
}
