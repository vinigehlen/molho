import { describe, expect, it } from 'vitest';
import { extractTenantId } from './module-invalidation-extension';

describe('extractTenantId', () => {
  it('acha tenantId direto no where (update/delete por where: {tenantId, moduleKey})', () => {
    expect(extractTenantId({ where: { tenantId: 't1', moduleKey: 'coupons' } })).toBe('t1');
  });

  it('acha tenantId na chave composta (where: {tenantId_moduleKey: {...}})', () => {
    expect(
      extractTenantId({ where: { tenantId_moduleKey: { tenantId: 't1', moduleKey: 'coupons' } } }),
    ).toBe('t1');
  });

  it('acha tenantId no data (create)', () => {
    expect(extractTenantId({ data: { tenantId: 't1', moduleKey: 'coupons', enabled: true } })).toBe(
      't1',
    );
  });

  it('createMany com array de data: não arrisca um tenant errado, devolve null', () => {
    expect(
      extractTenantId({ data: [{ tenantId: 't1' }, { tenantId: 't2' }] }),
    ).toBeNull();
  });

  it('updateMany sem tenantId no where (afeta vários tenants): devolve null', () => {
    expect(extractTenantId({ where: { moduleKey: 'coupons' } })).toBeNull();
  });

  it('args vazio ou inválido: devolve null, não lança', () => {
    expect(extractTenantId(undefined)).toBeNull();
    expect(extractTenantId({})).toBeNull();
    expect(extractTenantId('nao-e-objeto')).toBeNull();
  });
});
