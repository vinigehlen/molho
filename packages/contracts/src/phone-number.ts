/**
 * Value object de telefone brasileiro — normaliza, valida e é o único tipo
 * que `MessagingProvider.send()` aceita (nunca string bruta). Branded type +
 * funções puras, não classe: mesmo estilo do resto do pacote (modules.ts,
 * permissions.ts) — imutável, só se constrói via parsePhoneNumber().
 */
export type PhoneNumber = string & { readonly __brand: 'PhoneNumber' };

export class PhoneNumberError extends Error {
  constructor(raw: string, reason: string) {
    super(`Telefone inválido "${raw}": ${reason}`);
    this.name = 'PhoneNumberError';
  }
}

// DDDs válidos no plano de numeração da Anatel — 67 códigos. Faixas que NÃO
// existem (20,23,25,26,29,30,36,39,40,50,52,56-60,70,72,76,78,80,90) ficam
// de fora de propósito: um DDD inexistente é telefone inválido, não erro.
const VALID_DDDS = new Set([
  11, 12, 13, 14, 15, 16, 17, 18, 19, 21, 22, 24, 27, 28, 31, 32, 33, 34, 35, 37, 38, 41, 42, 43,
  44, 45, 46, 47, 48, 49, 51, 53, 54, 55, 61, 62, 63, 64, 65, 66, 67, 68, 69, 71, 73, 74, 75, 77,
  79, 81, 82, 83, 84, 85, 86, 87, 88, 89, 91, 92, 93, 94, 95, 96, 97, 98, 99,
]);

/** Extrai só o número nacional (DDD + assinante), sem código de país. */
function extractNationalDigits(raw: string): string {
  const digits = raw.replace(/\D/g, '');
  // "+5551999990000"/"5551999990000": 13 dígitos com "55" na frente é
  // código de país — qualquer outro comprimento é sempre número nacional
  // (a validação de tamanho abaixo rejeita o que não bater com 11 dígitos).
  if (digits.length === 13 && digits.startsWith('55')) return digits.slice(2);
  return digits;
}

/**
 * Aceita "+5551999990000", "(51) 99999-0000", "51999990000" — sempre
 * canoniza pra E.164. Lança PhoneNumberError se não for um celular
 * brasileiro válido (DDD real + 9 dígitos começando com 9).
 */
export function parsePhoneNumber(raw: string): PhoneNumber {
  const national = extractNationalDigits(raw);

  if (national.length !== 11) {
    throw new PhoneNumberError(raw, `esperado DDD + 9 dígitos (11 no total), veio ${national.length}`);
  }

  const ddd = Number(national.slice(0, 2));
  const subscriber = national.slice(2);

  if (!VALID_DDDS.has(ddd)) {
    throw new PhoneNumberError(raw, `DDD "${ddd}" não existe no plano de numeração`);
  }
  if (subscriber[0] !== '9') {
    throw new PhoneNumberError(raw, 'celular brasileiro precisa começar com 9 (o "nono dígito")');
  }

  return `+55${national}` as PhoneNumber;
}

/** Como parsePhoneNumber(), mas devolve null em vez de lançar. */
export function tryParsePhoneNumber(raw: string): PhoneNumber | null {
  try {
    return parsePhoneNumber(raw);
  } catch {
    return null;
  }
}

/** "(51) 99999-0000" — pra exibir em UI, nunca pra persistir/comparar. */
export function phoneNumberToDisplay(phone: PhoneNumber): string {
  const national = phone.slice(3); // remove "+55"
  const ddd = national.slice(0, 2);
  const subscriber = national.slice(2);
  return `(${ddd}) ${subscriber.slice(0, 5)}-${subscriber.slice(5)}`;
}

export function phoneNumberToE164(phone: PhoneNumber): string {
  return phone;
}
