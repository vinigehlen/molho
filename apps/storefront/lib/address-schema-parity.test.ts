import { describe, expect, it } from 'vitest';
import {
  ADDRESS_SCHEMA_VERSION as CONTRACTS_VERSION,
  customerAddressSchema as contractsAddressSchema,
} from '@molho/contracts';
import {
  ADDRESS_SCHEMA_VERSION as STOREFRONT_VERSION,
  customerAddressSchema as storefrontAddressSchema,
} from './address-storage';

/**
 * Mesma rede de segurança de cart-schema-parity.test.ts, pro par
 * address.ts / address-storage.ts. Import de `@molho/contracts` aqui é
 * seguro: roda sob Vitest, nunca passa pelo webpack do `next dev`.
 */
describe('paridade entre CustomerAddress canônico e a cópia do storefront', () => {
  it('ADDRESS_SCHEMA_VERSION é o mesmo nos dois arquivos', () => {
    expect(STOREFRONT_VERSION).toBe(CONTRACTS_VERSION);
  });

  it('customerAddressSchema tem exatamente os mesmos campos nos dois arquivos', () => {
    const camposCanonicos = Object.keys(contractsAddressSchema.shape).sort();
    const camposStorefront = Object.keys(storefrontAddressSchema.shape).sort();
    expect(camposStorefront).toEqual(camposCanonicos);
  });
});
