export type WeightedItemLineInput =
  | {
      itemName: string;
      weightGrams: number;
      pricePerKgCents: number;
      totalCents: number;
    }
  | {
      itemName: string;
      priceCents: number;
    };

export function formatWeightedItemLine(input: WeightedItemLineInput): string {
  const itemName = normalizeItemName(input.itemName);
  if ('priceCents' in input) {
    return `${itemName} — ${formatBRL(input.priceCents)}`;
  }

  return `${itemName} — ${formatKg(input.weightGrams)} kg × ${formatBRL(input.pricePerKgCents)}/kg = ${formatBRL(
    input.totalCents,
  )}`;
}

function normalizeItemName(itemName: string): string {
  return itemName.trim().replaceAll(/\s+/g, ' ') || 'Item sem nome';
}

function formatKg(weightGrams: number): string {
  const kilograms = assertNonNegativeInteger(weightGrams, 'weightGrams') / 1_000;
  return kilograms.toLocaleString('pt-BR', {
    minimumFractionDigits: 3,
    maximumFractionDigits: 3,
  });
}

function formatBRL(cents: number): string {
  const reais = assertNonNegativeInteger(cents, 'cents') / 100;
  return reais.toLocaleString('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function assertNonNegativeInteger(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${field} precisa ser inteiro não negativo.`);
  }
  return value;
}
