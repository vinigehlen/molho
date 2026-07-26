/**
 * PIX estático (Épico 8) — payload EMV "BR Code" (padrão Banco Central,
 * manual "Arranjo Pix" §QR Code) montado a partir da chave PIX do LOJISTA.
 * Sem PSP, sem webhook: o valor cai direto na conta do lojista (docs/01
 * §5-D.1, modelo A) e a confirmação é manual (CLAUDE.md regra 5).
 *
 * String determinística — TLV (tag-length-value) + CRC16. Não é
 * `PaymentProvider` (regra 8): não tem variação mock/real, é só formatação
 * de dados que já temos, então função pura aqui, sem porta/adapter.
 * Ponytail: ~90 linhas de spec, mais barato que uma dependência nova pra
 * uma string de TLV.
 */

export interface PixBrCodeInput {
  /** Chave PIX do lojista (CPF, CNPJ, e-mail, telefone ou aleatória) — vai crua no payload, o TIPO não entra no BR Code. */
  pixKey: string;
  /** Campo 59 (Merchant Name) — sanitizado e truncado em 25 chars. */
  merchantName: string;
  /** Campo 60 (Merchant City) — sanitizado e truncado em 15 chars. */
  merchantCity: string;
  /** Sempre inteiro em centavos (CLAUDE.md regra 4). */
  amountCents: number;
  /** Campo 62/05 (Reference Label) — identifica o pedido no extrato do lojista. Sanitizado pra alfanumérico, truncado em 25 chars; vazio vira "***" (convenção do padrão pra "sem referência"). */
  txid: string;
}

function tlv(id: string, value: string): string {
  return `${id}${value.length.toString().padStart(2, '0')}${value}`;
}

/** BR Code só aceita um alfabeto restrito (ASCII sem acento) — nunca deriva de texto livre sem passar por aqui. */
function sanitizeAscii(raw: string, maxLength: number): string {
  const stripped = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    // Pontua\u00e7\u00e3o removida (\u2014, /, etc.) vira espa\u00e7o, n\u00e3o desaparece \u2014 "Loja \u2014 Bairro" n\u00e3o pode virar "LOJABAIRRO" colado.
    .replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/ {2,}/g, ' ')
    .trim()
    .toUpperCase();
  return stripped.slice(0, maxLength) || 'NA';
}

function sanitizeTxid(raw: string): string {
  const stripped = raw.replace(/[^A-Za-z0-9]/g, '').slice(0, 25);
  return stripped || '***';
}

/**
 * CRC-16/CCITT-FALSE (poly 0x1021, init 0xFFFF, sem reflect, XorOut 0) — o
 * algoritmo que o padrão do Banco Central exige pro campo final (ID "63").
 */
function crc16(payload: string): string {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Monta o BR Code completo — string que vira QR (renderizado no cliente) e
 * também serve de "copia e cola". Ordem dos campos segue o manual do BC;
 * `63` (CRC) sempre por último, calculado sobre tudo que vem antes dele
 * MAIS o próprio prefixo `6304` (ID+tamanho do campo do CRC, sem o valor).
 */
export function buildPixBrCode(input: PixBrCodeInput): string {
  const merchantAccountInfo = tlv('00', 'BR.GOV.BCB.PIX') + tlv('01', input.pixKey);
  const additionalData = tlv('05', sanitizeTxid(input.txid));

  const withoutCrc =
    tlv('00', '01') + // Payload Format Indicator
    tlv('01', '11') + // Point of Initiation Method: 11 = estático (sem URL dinâmica)
    tlv('26', merchantAccountInfo) +
    tlv('52', '0000') + // Merchant Category Code — genérico, sem MCC específico
    tlv('53', '986') + // Transaction Currency — BRL (ISO 4217)
    tlv('54', (input.amountCents / 100).toFixed(2)) +
    tlv('58', 'BR') +
    tlv('59', sanitizeAscii(input.merchantName, 25)) +
    tlv('60', sanitizeAscii(input.merchantCity, 15)) +
    tlv('62', additionalData);

  return `${withoutCrc}6304${crc16(`${withoutCrc}6304`)}`;
}
