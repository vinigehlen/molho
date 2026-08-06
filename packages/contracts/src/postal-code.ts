/**
 * CEP — normalização única, usada pelo schema zod do checkout, pelo DTO do
 * Nest e pelo geocoder (Épico 6, Mundo A: o cliente digita CEP + número, o
 * servidor deriva o ponto).
 *
 * Não valida "CEP existe" — isso é resposta do ViaCEP, não de regex. Só
 * canoniza formato: 8 dígitos, sem hífen.
 */

/** "01310-100", "01310100", " 01310 100 " → "01310100". `null` se não forem 8 dígitos. */
export function normalizePostalCode(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  return digits.length === 8 ? digits : null;
}
