/**
 * ViaCEP direto do BROWSER — só pra PREENCHER o formulário de endereço.
 *
 * Não é fonte de verdade de nada: `GeocodeMiddleware` (apps/api) consulta o
 * mesmo CEP por conta própria e `resolveAddress()` sobrescreve o texto que o
 * cliente mandar (Épico 6, Bloco 2). Por isso dá pra chamar daqui sem
 * endpoint nosso no meio: o pior caso de um cliente adulterar a resposta é
 * ele ver na tela um endereço que o servidor não vai usar.
 *
 * ViaCEP é público, com CORS aberto e sem chave. Um endpoint nosso
 * (`GET /v1/geo/cep/:cep`, reusando ViaCepNominatimGeocoder) só se paga se o
 * piloto mostrar volume que justifique cache compartilhado — um CEP por
 * pedido não mostra.
 *
 * Nunca chama o Nominatim: preencher campo não precisa de ponto.
 */

const VIACEP_BASE = 'https://viacep.com.br/ws';
const TIMEOUT_MS = 4_000;

export interface ViaCepAddress {
  /** `null` = o ViaCEP não afirma este campo (CEP "geral" de cidade não tem rua/bairro) — o campo continua editável na UI. */
  street: string | null;
  neighborhood: string | null;
  city: string | null;
  state: string | null;
}

export type ViaCepResult =
  | { status: 'found'; address: ViaCepAddress }
  /** O CEP não existe. Cliente confere o número que digitou. */
  | { status: 'not_found' }
  /** Rede, timeout, 500, JSON quebrado. Cliente preenche à mão e segue. */
  | { status: 'unavailable' };

/** Nunca lança. Espelha o tratamento de `fetchViaCep` do geocoder do servidor. */
export async function lookupPostalCode(postalCode: string): Promise<ViaCepResult> {
  const digits = postalCode.replace(/\D/g, '');
  if (digits.length !== 8) return { status: 'not_found' };

  let body: unknown;
  try {
    const response = await fetch(`${VIACEP_BASE}/${digits}/json/`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { status: 'unavailable' };
    body = await response.json();
  } catch {
    return { status: 'unavailable' };
  }

  if (typeof body !== 'object' || body === null) return { status: 'unavailable' };
  const record = body as Record<string, unknown>;
  // `erro` é booleano nas versões antigas e string "true" nas novas.
  if (record.erro) return { status: 'not_found' };

  return {
    status: 'found',
    address: {
      street: asString(record.logradouro),
      neighborhood: asString(record.bairro),
      city: asString(record.localidade),
      state: asString(record.uf),
    },
  };
}

function asString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed === '' ? null : trimmed;
}
