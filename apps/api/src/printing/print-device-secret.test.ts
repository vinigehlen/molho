import { describe, expect, it } from 'vitest';
import {
  generateDeviceSecret,
  hashDeviceSecret,
  maskDeviceSecret,
  parseDeviceSecret,
  verifyDeviceSecret,
} from './print-device-secret';

describe('print-device-secret', () => {
  it('gera segredo molho_pd_, prefixo de 12 e hash que confere', () => {
    const { secret, tokenPrefix, tokenHash } = generateDeviceSecret();
    expect(secret.startsWith('molho_pd_')).toBe(true);
    expect(tokenPrefix).toHaveLength(12);
    expect(secret.slice('molho_pd_'.length, 'molho_pd_'.length + 12)).toBe(tokenPrefix);
    expect(verifyDeviceSecret(secret, tokenHash)).toBe(true);
  });

  it('recusa segredo errado', () => {
    const a = generateDeviceSecret();
    const b = generateDeviceSecret();
    expect(verifyDeviceSecret(b.secret, a.tokenHash)).toBe(false);
    expect(verifyDeviceSecret('molho_pd_lixo', a.tokenHash)).toBe(false);
  });

  it('verifyDeviceSecret é robusto a hash malformado', () => {
    expect(verifyDeviceSecret('molho_pd_x', 'semseparador')).toBe(false);
    expect(verifyDeviceSecret('molho_pd_x', ':')).toBe(false);
    expect(verifyDeviceSecret('molho_pd_x', '')).toBe(false);
  });

  it('dois segredos gerados têm hash diferente (salt aleatório)', () => {
    expect(hashDeviceSecret('molho_pd_igual')).not.toBe(hashDeviceSecret('molho_pd_igual'));
  });

  it('parseDeviceSecret extrai o prefixo e rejeita formatos inválidos', () => {
    const { secret, tokenPrefix } = generateDeviceSecret();
    expect(parseDeviceSecret(secret)).toEqual({ tokenPrefix });
    expect(parseDeviceSecret('Bearer abc')).toBeNull();
    expect(parseDeviceSecret('molho_pd_curto')).toBeNull();
    expect(parseDeviceSecret('')).toBeNull();
  });

  it('maskDeviceSecret nunca contém o segredo inteiro', () => {
    const { secret, tokenPrefix } = generateDeviceSecret();
    const masked = maskDeviceSecret(tokenPrefix);
    expect(masked).toContain(tokenPrefix);
    expect(masked).not.toBe(secret);
    expect(secret).not.toContain(masked);
  });
});
