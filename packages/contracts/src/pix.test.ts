import { describe, expect, it } from 'vitest';
import { buildPixBrCode } from './pix';

/** Reimplementação independente do CRC pra não testar a função contra ela mesma. */
function crc16Reference(payload: string): string {
  let crc = 0xffff;
  for (const char of payload) {
    crc ^= char.charCodeAt(0) << 8;
    for (let bit = 0; bit < 8; bit++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/** Parser TLV mínimo só pra reabrir o payload gerado e conferir os campos — não é o parser de produção, é ferramenta de teste. */
function parseTlv(payload: string): Map<string, string> {
  const fields = new Map<string, string>();
  let i = 0;
  while (i < payload.length) {
    const id = payload.slice(i, i + 2);
    const length = Number(payload.slice(i + 2, i + 4));
    const value = payload.slice(i + 4, i + 4 + length);
    fields.set(id, value);
    i += 4 + length;
  }
  return fields;
}

const BASE_INPUT = {
  pixKey: 'loja@exemplo.com.br',
  merchantName: 'Hamburgueria da Vila',
  merchantCity: 'Estância Velha',
  amountCents: 3590,
  txid: 'pedido-abc-123',
};

describe('buildPixBrCode', () => {
  it('termina com o CRC16 correto sobre o próprio payload', () => {
    const payload = buildPixBrCode(BASE_INPUT);
    const withoutCrcValue = payload.slice(0, -4);
    expect(payload.slice(-4)).toBe(crc16Reference(withoutCrcValue));
  });

  it('é determinístico — mesma entrada, mesmo payload', () => {
    expect(buildPixBrCode(BASE_INPUT)).toBe(buildPixBrCode(BASE_INPUT));
  });

  it('monta os campos obrigatórios do BR Code', () => {
    const fields = parseTlv(buildPixBrCode(BASE_INPUT).slice(0, -8)); // sem o campo 63 (CRC) no fim
    expect(fields.get('00')).toBe('01'); // Payload Format Indicator
    expect(fields.get('53')).toBe('986'); // BRL
    expect(fields.get('54')).toBe('35.90'); // amountCents → decimal
    expect(fields.get('58')).toBe('BR');
    expect(fields.get('59')).toBe('HAMBURGUERIA DA VILA');
    expect(fields.get('60')).toBe('ESTANCIA VELHA'); // sem acento, uppercase
  });

  it('embute a chave PIX dentro do campo 26 (Merchant Account Information)', () => {
    const fields = parseTlv(buildPixBrCode(BASE_INPUT).slice(0, -8));
    const merchantAccountInfo = parseTlv(fields.get('26')!);
    expect(merchantAccountInfo.get('00')).toBe('BR.GOV.BCB.PIX');
    expect(merchantAccountInfo.get('01')).toBe('loja@exemplo.com.br');
  });

  it('sanitiza txid pra alfanumérico e trunca em 25 chars', () => {
    const fields = parseTlv(buildPixBrCode(BASE_INPUT).slice(0, -8));
    const additionalData = parseTlv(fields.get('62')!);
    expect(additionalData.get('05')).toBe('pedidoabc123');
  });

  it('txid vazio vira "***" (convenção do padrão)', () => {
    const fields = parseTlv(buildPixBrCode({ ...BASE_INPUT, txid: '' }).slice(0, -8));
    const additionalData = parseTlv(fields.get('62')!);
    expect(additionalData.get('05')).toBe('***');
  });

  it('travessão no nome vira espaço só, não some colando as palavras (achado validando contra pix-utils)', () => {
    const fields = parseTlv(buildPixBrCode({ ...BASE_INPUT, merchantName: 'Hamburgueria da Vila — Bela Vista' }).slice(0, -8));
    expect(fields.get('59')).toBe('HAMBURGUERIA DA VILA BELA'); // sem espaço duplo, truncado em 25
  });

  it('trunca nome do lojista em 25 chars e cidade em 15', () => {
    const fields = parseTlv(
      buildPixBrCode({
        ...BASE_INPUT,
        merchantName: 'Restaurante Muito Grande Demais Pro Campo',
        merchantCity: 'Uma Cidade Com Nome Bem Longo',
      }).slice(0, -8),
    );
    expect(fields.get('59')!.length).toBeLessThanOrEqual(25);
    expect(fields.get('60')!.length).toBeLessThanOrEqual(15);
  });
});
