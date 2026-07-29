/**
 * Value object de e-mail — mesmo papel do PhoneNumber pro canal de e-mail
 * (Épico 9c): único tipo que `EmailProvider.send()` aceita, nunca string
 * bruta. Branded type + funções puras, igual ao resto do pacote.
 *
 * A normalização (trim + lowercase) é o ponto: o e-mail vira o `identifier`
 * do OtpRecipient, ou seja, a CHAVE do desafio e do rate limit. Se um caminho
 * normalizasse e outro não, "Ana@x.com" e "ana@x.com" abririam DOIS desafios
 * e DOIS baldes de rate limit pra mesma pessoa — furo de rate limit, não
 * cosmética.
 *
 * Validação deliberadamente RASA (tem @, tem domínio com ponto, sem espaço):
 * a única prova de que um e-mail existe é mandar o código pra ele, e é
 * exatamente isso que o OTP faz. Regex "RFC-completa" só rejeita endereço
 * válido esquisito e não aceita nada a mais.
 */
export type EmailAddress = string & { readonly __brand: 'EmailAddress' };

export class EmailAddressError extends Error {
  constructor(raw: string, reason: string) {
    super(`E-mail inválido "${raw}": ${reason}`);
    this.name = 'EmailAddressError';
  }
}

/** Aceita " Ana@Loja.com " → "ana@loja.com". Lança EmailAddressError se não passar. */
export function parseEmail(raw: string): EmailAddress {
  const email = raw.trim().toLowerCase();

  if (/\s/.test(email)) throw new EmailAddressError(raw, 'não pode conter espaço');

  const at = email.lastIndexOf('@');
  if (at <= 0) throw new EmailAddressError(raw, 'esperado algo antes do "@"');

  const domain = email.slice(at + 1);
  if (!domain.includes('.') || domain.startsWith('.') || domain.endsWith('.')) {
    throw new EmailAddressError(raw, 'domínio precisa ter um ponto no meio');
  }
  if (email.length > 254) throw new EmailAddressError(raw, 'passa de 254 caracteres');

  return email as EmailAddress;
}

/** Como parseEmail(), mas devolve null em vez de lançar. */
export function tryParseEmail(raw: string): EmailAddress | null {
  try {
    return parseEmail(raw);
  } catch {
    return null;
  }
}
