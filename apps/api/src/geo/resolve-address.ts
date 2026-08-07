import type { GeocodedAddress } from './geocoder';

/** Os campos de texto que o cliente ainda manda, usados como fallback. */
export interface AddressTextFallback {
  street: string;
  neighborhood: string;
  city: string;
  state: string;
}

export interface ResolvedAddress extends AddressTextFallback {
  /** `null` quando nenhum geocoder achou ponto — não bloqueia o pedido. */
  lat: number | null;
  lng: number | null;
  /**
   * `false` quando o ViaCEP ficou mudo e a CIDADE que decide a taxa veio do
   * texto do cliente. Vira `orders.delivery_postal_code_verified` pro lojista
   * conferir a taxa antes de despachar.
   */
  postalCodeVerified: boolean;
}

/**
 * ÚNICO lugar onde vive a precedência "ViaCEP ganha, texto do cliente
 * preenche o resto" (Épico 6, Bloco 2). Consumido pela revalidação e pela
 * criação de pedido — duplicar essa regra é como ela diverge.
 *
 * A cidade sai daqui em forma de EXIBIÇÃO ("Estância Velha"), não
 * normalizada: quem compara é `molho_city_key()` no Postgres, aplicada aos
 * DOIS lados da query de match. Uma segunda implementação do normalizador em
 * TS poderia divergir num acento, e o sintoma seria fora-de-área silencioso.
 *
 * Função pura: não toca banco nem rede. O geocode já aconteceu no middleware,
 * fora da transação de request (CLAUDE.md § Contexto de request).
 */
export function resolveAddress(input: AddressTextFallback, geocoded: GeocodedAddress | undefined): ResolvedAddress {
  return {
    street: pick(geocoded?.street, input.street),
    neighborhood: pick(geocoded?.neighborhood, input.neighborhood),
    city: pick(geocoded?.city, input.city),
    state: pick(geocoded?.state, input.state),
    lat: geocoded?.lat ?? null,
    lng: geocoded?.lng ?? null,
    postalCodeVerified: geocoded?.postalCodeFound ?? false,
  };
}

function pick(autoritativo: string | null | undefined, doCliente: string): string {
  return autoritativo ?? doCliente.trim();
}
