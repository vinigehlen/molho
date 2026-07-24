import { act, renderHook, waitFor } from '@testing-library/react';
import type { CartItem } from '@molho/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { CART_SCHEMA_VERSION, cartStorageKey } from './cart-storage';
import { useCart } from './use-cart';

const SLUG = 'hamburgueria-da-vila';

function item(overrides: Partial<CartItem> = {}): CartItem {
  return {
    lineId: '0193f1a0-0000-7000-8000-000000000001',
    productId: '0193f1a0-0000-7000-8000-000000000002',
    name: 'X-Burger',
    description: null,
    imageUrl: null,
    unitBasePriceCents: 2890,
    modifiers: [],
    quantity: 1,
    notes: null,
    ...overrides,
  };
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('useCart', () => {
  it('começa vazio quando não há nada salvo', () => {
    const { result } = renderHook(() => useCart(SLUG));
    expect(result.current.cart.items).toEqual([]);
    expect(result.current.itemCount).toBe(0);
  });

  it('lê o que já estava salvo no localStorage ao montar', async () => {
    localStorage.setItem(
      cartStorageKey(SLUG),
      JSON.stringify({
        schemaVersion: CART_SCHEMA_VERSION,
        slug: SLUG,
        items: [item({ quantity: 2 })],
        updatedAt: new Date().toISOString(),
      }),
    );

    const { result } = renderHook(() => useCart(SLUG));
    await waitFor(() => expect(result.current.cart.items).toHaveLength(1));
    expect(result.current.itemCount).toBe(2);
  });

  it('addItem grava no localStorage e atualiza itemCount/subtotalCents', () => {
    const { result } = renderHook(() => useCart(SLUG));

    act(() => result.current.addItem(item({ quantity: 2, unitBasePriceCents: 1000 })));

    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.itemCount).toBe(2);
    expect(result.current.subtotalCents).toBe(2000);

    const salvo = JSON.parse(localStorage.getItem(cartStorageKey(SLUG)) ?? '{}');
    expect(salvo.items).toHaveLength(1);
  });

  it('updateQuantity com 0 remove a linha (nunca deixa quantidade inválida salva)', () => {
    const { result } = renderHook(() => useCart(SLUG));

    act(() => result.current.addItem(item({ lineId: 'linha-1' })));
    act(() => result.current.updateQuantity('linha-1', 0));

    expect(result.current.cart.items).toEqual([]);
  });

  it('removeItem tira só a linha certa', () => {
    const { result } = renderHook(() => useCart(SLUG));

    act(() => result.current.addItem(item({ lineId: 'linha-1' })));
    act(() => result.current.addItem(item({ lineId: 'linha-2' })));
    act(() => result.current.removeItem('linha-1'));

    expect(result.current.cart.items).toHaveLength(1);
    expect(result.current.cart.items[0]?.lineId).toBe('linha-2');
  });

  it('duas "abas" (dois hooks montados) sincronizam via BroadcastChannel', async () => {
    const abaA = renderHook(() => useCart(SLUG));
    const abaB = renderHook(() => useCart(SLUG));

    act(() => abaA.result.current.addItem(item({ lineId: 'linha-da-aba-a' })));

    await waitFor(() => expect(abaB.result.current.cart.items).toHaveLength(1));
    expect(abaB.result.current.cart.items[0]?.lineId).toBe('linha-da-aba-a');
  });

  it('clearCart esvazia o carrinho e persiste (Épico 7: depois de criar o pedido)', () => {
    const { result } = renderHook(() => useCart(SLUG));

    act(() => result.current.addItem(item()));
    act(() => result.current.clearCart());

    expect(result.current.cart.items).toEqual([]);
    const salvo = JSON.parse(localStorage.getItem(cartStorageKey(SLUG)) ?? '{}');
    expect(salvo.items).toEqual([]);
  });

  it('carrinho de OUTRA loja nunca aparece: canais e chaves são por slug', async () => {
    const lojaA = renderHook(() => useCart('hamburgueria-da-vila'));
    const lojaB = renderHook(() => useCart('pizzaria-roma'));

    act(() => lojaA.result.current.addItem(item()));

    // Dá tempo pro BroadcastChannel de lojaA (se por engano vazasse) chegar.
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(lojaB.result.current.cart.items).toEqual([]);
  });
});
