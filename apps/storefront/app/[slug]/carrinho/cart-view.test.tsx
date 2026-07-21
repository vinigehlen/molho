import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Cart, CartItem } from '@molho/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CART_SCHEMA_VERSION, cartStorageKey } from '../../../lib/cart-storage';
import { CartView } from './cart-view';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

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

function salvarCarrinho(items: CartItem[]) {
  const cart: Cart = { schemaVersion: CART_SCHEMA_VERSION, slug: SLUG, items, updatedAt: new Date().toISOString() };
  localStorage.setItem(cartStorageKey(SLUG), JSON.stringify(cart));
}

function renderCartView() {
  return render(
    <CartView
      slug={SLUG}
      storeName="Hamburgueria da Vila"
      emptyTitle="Seu carrinho tá vazio"
      emptyBody="Bora resolver isso?"
      emptyActionLabel="Ver o cardápio"
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
});

describe('CartView', () => {
  it('carrinho vazio: mostra o empty state e o botão leva de volta pro cardápio', async () => {
    renderCartView();

    expect(await screen.findByText('Seu carrinho tá vazio')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver o cardápio' }));
    expect(push).toHaveBeenCalledWith(`/${SLUG}`);
  });

  it('mostra nome, modificadores, observação e o total da linha', async () => {
    salvarCarrinho([
      item({
        name: 'X-Burger',
        unitBasePriceCents: 2890,
        quantity: 2,
        modifiers: [
          { id: '0193f1a0-0000-7000-8000-0000000000a1', groupId: '0193f1a0-0000-7000-8000-0000000000a0', name: 'Bacon', priceDeltaCents: 400 },
          { id: '0193f1a0-0000-7000-8000-0000000000a2', groupId: '0193f1a0-0000-7000-8000-0000000000a0', name: 'Ovo', priceDeltaCents: 300 },
        ],
        notes: 'Sem cebola',
      }),
    ]);

    renderCartView();

    expect(await screen.findByText('X-Burger')).toBeInTheDocument();
    expect(screen.getByText('Bacon, Ovo')).toBeInTheDocument();
    expect(screen.getByText('"Sem cebola"')).toBeInTheDocument();
    // (2890 + 400 + 300) * 2 = 7180 — item único: total da linha e subtotal coincidem.
    expect(screen.getAllByText('R$ 71,80')).toHaveLength(2);
  });

  it('mostra a foto e a descrição do produto quando o snapshot da linha tem os dois', async () => {
    salvarCarrinho([
      item({
        name: 'X-Burger',
        description: '180g, queijo prato, alface, tomate',
        imageUrl: 'https://pub-example.r2.dev/products/x/foto.jpg',
      }),
    ]);

    renderCartView();

    expect(await screen.findByText('180g, queijo prato, alface, tomate')).toBeInTheDocument();
    // alt="" (decorativa, ver comentário em MoProductCard) tira a <img> do role "img" da árvore
    // de acessibilidade — busca no DOM direto, não por role.
    const foto = document.querySelector('img');
    expect(foto).toHaveAttribute('src', 'https://pub-example.r2.dev/products/x/foto.jpg');
  });

  it('sem foto, cai no placeholder do tema (sem <img> nenhuma na linha)', async () => {
    salvarCarrinho([item({ name: 'X-Burger', imageUrl: null })]);

    renderCartView();

    await screen.findByText('X-Burger');
    expect(document.querySelector('img')).not.toBeInTheDocument();
  });

  it('mostra o subtotal de todas as linhas', async () => {
    salvarCarrinho([
      item({ lineId: '0193f1a0-0000-7000-8000-000000000011', unitBasePriceCents: 1000, quantity: 2 }),
      item({ lineId: '0193f1a0-0000-7000-8000-000000000012', unitBasePriceCents: 500, quantity: 1 }),
    ]);

    renderCartView();

    expect(await screen.findByText('Subtotal')).toBeInTheDocument();
    // (1000*2) + (500*1) = 2500
    expect(screen.getByText('R$ 25,00')).toBeInTheDocument();
  });

  it('Remover tira a linha do carrinho e persiste', async () => {
    salvarCarrinho([item({ lineId: '0193f1a0-0000-7000-8000-000000000011', name: 'X-Burger' })]);
    renderCartView();

    await screen.findByText('X-Burger');
    await userEvent.click(screen.getByRole('button', { name: 'Remover' }));

    expect(screen.queryByText('X-Burger')).not.toBeInTheDocument();
    expect(await screen.findByText('Seu carrinho tá vazio')).toBeInTheDocument();

    const salvo = JSON.parse(localStorage.getItem(cartStorageKey(SLUG)) ?? '{}');
    expect(salvo.items).toEqual([]);
  });

  it('ajustar quantidade no stepper atualiza o subtotal', async () => {
    salvarCarrinho([item({ lineId: '0193f1a0-0000-7000-8000-000000000011', unitBasePriceCents: 1000, quantity: 1 })]);
    renderCartView();

    await screen.findByText('Subtotal');
    // Um item só: total da linha e subtotal coincidem — dois elementos com o mesmo texto.
    expect(screen.getAllByText('R$ 10,00')).toHaveLength(2);

    await userEvent.click(screen.getByRole('button', { name: 'Colocar mais um' }));

    await waitFor(() => expect(screen.getAllByText('R$ 20,00')).toHaveLength(2));
  });
});
