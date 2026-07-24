import { describe, expect, it } from 'vitest';
import { CUSTOMER_TOKEN_SCHEMA_VERSION, CUSTOMER_TOKEN_TTL_MS, parseStoredCustomerToken } from './customer-token-storage';

const AGORA = new Date('2026-07-23T12:00:00.000Z');

function salvo(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    schemaVersion: CUSTOMER_TOKEN_SCHEMA_VERSION,
    accessToken: 'token-abc',
    customerId: '0193f1a0-0000-7000-8000-000000000001',
    issuedAt: AGORA.toISOString(),
    ...overrides,
  };
}

describe('parseStoredCustomerToken', () => {
  it('null quando não há nada salvo', () => {
    expect(parseStoredCustomerToken(null, AGORA)).toBeNull();
  });

  it('lê um token válido, recém-emitido', () => {
    const resultado = parseStoredCustomerToken(JSON.stringify(salvo()), AGORA);
    expect(resultado).toMatchObject({ accessToken: 'token-abc', customerId: '0193f1a0-0000-7000-8000-000000000001' });
  });

  it('expirado (mais de 15min): devolve null', () => {
    const emitidoHaMuitoTempo = new Date(AGORA.getTime() - CUSTOMER_TOKEN_TTL_MS - 1000);
    const resultado = parseStoredCustomerToken(JSON.stringify(salvo({ issuedAt: emitidoHaMuitoTempo.toISOString() })), AGORA);
    expect(resultado).toBeNull();
  });

  it('bem no limite do TTL (1s antes de expirar): ainda válido', () => {
    const quaseExpirando = new Date(AGORA.getTime() - CUSTOMER_TOKEN_TTL_MS + 1000);
    const resultado = parseStoredCustomerToken(JSON.stringify(salvo({ issuedAt: quaseExpirando.toISOString() })), AGORA);
    expect(resultado).not.toBeNull();
  });

  it('JSON corrompido: devolve null, nunca lança', () => {
    expect(parseStoredCustomerToken('{not json', AGORA)).toBeNull();
  });

  it('schemaVersion de outro formato: devolve null (descarta, não tenta migrar)', () => {
    expect(parseStoredCustomerToken(JSON.stringify(salvo({ schemaVersion: 999 })), AGORA)).toBeNull();
  });

  it('campo obrigatório faltando: devolve null', () => {
    const { accessToken: _accessToken, ...semToken } = salvo();
    expect(parseStoredCustomerToken(JSON.stringify(semToken), AGORA)).toBeNull();
  });
});
