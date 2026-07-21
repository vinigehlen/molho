import { describe, expect, it } from 'vitest';
import { CART_SCHEMA_VERSION as CONTRACTS_VERSION, cartItemSchema as contractsCartItemSchema } from '@molho/contracts';
import { CART_SCHEMA_VERSION as STOREFRONT_VERSION, cartItemSchema as storefrontCartItemSchema } from './cart-storage';

/**
 * `apps/storefront/lib/cart-storage.ts` reimplementa
 * `packages/contracts/src/cart.ts` à mão (razão documentada no topo dos dois
 * arquivos: import.meta do CJS de `@molho/contracts` quebra o webpack do
 * `next dev` em runtime de `'use client'`). Duas fontes que precisam mudar
 * juntas é exatamente o tipo de coisa que gera bug silencioso — este teste
 * reprova o build se alguém mudar um lado e esquecer o outro.
 *
 * Import de `@molho/contracts` aqui é seguro: este arquivo roda sob Vitest
 * (Node/jsdom), nunca passa pelo webpack do `next dev` — o bug documentado é
 * especificamente do bundle de CLIENTE, não de teste.
 */
describe('paridade entre CartItem canônico e a cópia do storefront', () => {
  it('CART_SCHEMA_VERSION é o mesmo nos dois arquivos', () => {
    expect(STOREFRONT_VERSION).toBe(CONTRACTS_VERSION);
  });

  it('cartItemSchema tem exatamente os mesmos campos nos dois arquivos', () => {
    const camposCanonicos = Object.keys(contractsCartItemSchema.shape).sort();
    const camposStorefront = Object.keys(storefrontCartItemSchema.shape).sort();
    expect(camposStorefront).toEqual(camposCanonicos);
  });
});
