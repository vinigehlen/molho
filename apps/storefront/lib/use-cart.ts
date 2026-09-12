'use client';

import * as React from 'react';
import type { Cart, CartItem } from '@molho/contracts';
import { cartItemCount, cartStorageKey, cartSubtotalCents, emptyCart, parseStoredCart } from './cart-storage';

/**
 * Estado do carrinho: `localStorage` é a fonte de verdade (sobrevive a
 * reload, compartilhada entre `/{slug}` e a futura `/{slug}/carrinho`, Épico
 * 5 commit 8 — cada página só chama `useCart(slug)` de novo, sem Context
 * nenhum). `BroadcastChannel` sincroniza abas ABERTAS ao vivo — o evento
 * nativo `storage` já faria isso, mas não dispara na aba que escreveu, e o
 * pedido era sincronizar entre abas de verdade, não só persistir.
 *
 * UM canal por LOJA, mesma chave do `localStorage` — carrinho de duas lojas
 * nunca se cruza, nem em memória nem em mensagem de canal.
 *
 * `BroadcastChannel` sem suporte (Safari bem antigo): a aba simplesmente não
 * sincroniza com as outras, mas continua funcionando sozinha — degradação
 * graciosa, não erro.
 */
/** IDs em ordem estável — a ordem de seleção do cliente não deve importar. */
function idsOrdenados(ids: readonly string[] | undefined): string {
  return [...(ids ?? [])].sort().join(',');
}

function mesmaLinha(a: CartItem, b: CartItem): boolean {
  return (
    a.productId === b.productId &&
    a.offerId === b.offerId &&
    a.notes === b.notes &&
    idsOrdenados(a.modifiers.map((m) => m.id)) === idsOrdenados(b.modifiers.map((m) => m.id)) &&
    idsOrdenados(a.removedChildIds) === idsOrdenados(b.removedChildIds)
  );
}

export interface UseCartResult {
  cart: Cart;
  itemCount: number;
  subtotalCents: number;
  addItem: (item: CartItem) => void;
  removeItem: (lineId: string) => void;
  updateQuantity: (lineId: string, quantity: number) => void;
  /** Esvazia o carrinho — chamado depois que um pedido é criado com sucesso (Épico 7), pra não sobrar o mesmo carrinho pro cliente reenviar sem querer. */
  clearCart: () => void;
}

export function useCart(slug: string): UseCartResult {
  const [cart, setCart] = React.useState<Cart>(() => emptyCart(slug));
  const canalRef = React.useRef<BroadcastChannel | null>(null);

  React.useEffect(() => {
    setCart(parseStoredCart(localStorage.getItem(cartStorageKey(slug)), slug));

    if (typeof BroadcastChannel === 'undefined') return;

    const canal = new BroadcastChannel(cartStorageKey(slug));
    canalRef.current = canal;
    canal.onmessage = (evento: MessageEvent<Cart>) => setCart(evento.data);

    return () => {
      canal.close();
      canalRef.current = null;
    };
  }, [slug]);

  // Grava e propaga são efeitos colaterais de VERDADE (localStorage,
  // postMessage) — de propósito FORA de um updater `setCart(prev => ...)`,
  // que o React (Strict Mode, `reactStrictMode: true` no next.config.ts)
  // pode invocar mais de uma vez em dev: um updater teria que ser puro, e
  // gravar/propagar duas vezes por clique seria um bug sutil.
  const persistirEPropagar = React.useCallback(
    (proximo: Cart) => {
      setCart(proximo);
      localStorage.setItem(cartStorageKey(slug), JSON.stringify(proximo));
      canalRef.current?.postMessage(proximo);
    },
    [slug],
  );

  const addItem = React.useCallback(
    (item: CartItem) => {
      // Mesmo produto + mesma oferta + mesmos complementos + mesma remoção de
      // combo + mesma observação: é o MESMO pedido, só soma quantidade em vez
      // de virar uma segunda linha (senão "Kit Galeto, alho e óleo" vira duas
      // linhas idênticas em vez de virar quantidade 2 na mesma linha).
      const existing = cart.items.find((outro) => mesmaLinha(outro, item));
      const items = existing
        ? cart.items.map((outro) => (outro === existing ? { ...outro, quantity: outro.quantity + item.quantity } : outro))
        : [...cart.items, item];
      persistirEPropagar({ ...cart, items, updatedAt: new Date().toISOString() });
    },
    [cart, persistirEPropagar],
  );

  const removeItem = React.useCallback(
    (lineId: string) => {
      persistirEPropagar({
        ...cart,
        items: cart.items.filter((item) => item.lineId !== lineId),
        updatedAt: new Date().toISOString(),
      });
    },
    [cart, persistirEPropagar],
  );

  const updateQuantity = React.useCallback(
    (lineId: string, quantity: number) => {
      if (quantity <= 0) {
        removeItem(lineId);
        return;
      }
      persistirEPropagar({
        ...cart,
        items: cart.items.map((item) => (item.lineId === lineId ? { ...item, quantity } : item)),
        updatedAt: new Date().toISOString(),
      });
    },
    [cart, persistirEPropagar, removeItem],
  );

  const clearCart = React.useCallback(() => {
    persistirEPropagar(emptyCart(slug));
  }, [slug, persistirEPropagar]);

  return {
    cart,
    itemCount: cartItemCount(cart),
    subtotalCents: cartSubtotalCents(cart),
    addItem,
    removeItem,
    updateQuantity,
    clearCart,
  };
}
