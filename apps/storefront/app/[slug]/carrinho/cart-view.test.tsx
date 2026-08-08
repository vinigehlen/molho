import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Cart, CartItem } from '@molho/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ADDRESS_SCHEMA_VERSION, addressStorageKey } from '../../../lib/address-storage';
import { CART_SCHEMA_VERSION, cartStorageKey } from '../../../lib/cart-storage';
import type * as CheckoutApiModule from '../../../lib/checkout-api';
import { CartView } from './cart-view';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const { revalidateCheckout, createOrder } = vi.hoisted(() => ({
  revalidateCheckout: vi.fn(),
  createOrder: vi.fn(),
}));
vi.mock('../../../lib/checkout-api', async (importOriginal) => {
  const actual = await importOriginal<typeof CheckoutApiModule>();
  return { ...actual, revalidateCheckout, createOrder };
});

const { requestOtp, verifyOtp } = vi.hoisted(() => ({ requestOtp: vi.fn(), verifyOtp: vi.fn() }));
vi.mock('../../../lib/customer-auth-api', () => ({ requestOtp, verifyOtp }));

const SLUG = 'hamburgueria-da-vila';

const REVIEW_PADRAO = {
  items: [
    {
      productId: '0193f1a0-0000-7000-8000-000000000002',
      name: 'X-Burger',
      available: true,
      unitBasePriceCents: 2890,
      modifiers: [],
      quantity: 1,
      notes: null,
      lineTotalCents: 2890,
      priceChanged: false,
    },
  ],
  subtotalCents: 2890,
  withinZone: true,
  deliveryFeeCents: 800,
  etaMinMinutes: 30,
  etaMaxMinutes: 50,
  isOpenNow: true,
  nextOpensAt: null,
  minOrderCents: 1000,
  totalCents: 3690,
  hasUnfavorableDivergence: false,
  canSubmit: true,
};

function salvarEndereco(overrides: Partial<Record<string, unknown>> = {}) {
  localStorage.setItem(
    addressStorageKey(SLUG),
    JSON.stringify({
      schemaVersion: ADDRESS_SCHEMA_VERSION,
      label: 'Casa',
      street: 'Rua das Palmeiras',
      number: '120',
      complement: null,
      neighborhood: 'Bela Vista',
      city: 'Estância Velha',
      state: 'RS',
      postalCode: '93610-000',
      referencePoint: null,
      lat: -29.6,
      lng: -51.17,
      updatedAt: new Date().toISOString(),
      ...overrides,
    }),
  );
}

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

function renderCartView(overrides: { availablePaymentMethods?: ('pix' | 'cash_on_delivery' | 'card_on_delivery')[] } = {}) {
  return render(
    <CartView
      slug={SLUG}
      storeName="Hamburgueria da Vila"
      availablePaymentMethods={overrides.availablePaymentMethods ?? ['pix', 'cash_on_delivery', 'card_on_delivery']}
      emptyTitle="Seu carrinho tá vazio"
      emptyBody="Bora resolver isso?"
      emptyActionLabel="Ver o cardápio"
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
  revalidateCheckout.mockReset().mockResolvedValue(REVIEW_PADRAO);
  createOrder.mockReset();
  requestOtp.mockReset().mockResolvedValue({ ok: true });
  verifyOtp.mockReset().mockResolvedValue({ ok: true, accessToken: 'token-x', customerId: 'customer-1' });
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

describe('CartView — checkout (Épico 7)', () => {
  it('sem endereço salvo: "Fazer pedido" desabilitado', async () => {
    salvarCarrinho([item()]);
    renderCartView();

    await screen.findByText('Adicionar endereço de entrega');
    expect(screen.getByRole('button', { name: 'Fazer pedido' })).toBeDisabled();
  });

  it('endereço sem CEP: "Fazer pedido" continua desabilitado, com aviso', async () => {
    // É o CEP que o servidor geocoda — sem ele não há cidade, e sem cidade
    // não há taxa (Épico 6, Bloco 2). lat/lng do cliente não contam mais.
    salvarCarrinho([item()]);
    salvarEndereco({ postalCode: null });
    renderCartView();

    await screen.findByText(/Rua das Palmeiras/);
    expect(screen.getByRole('button', { name: 'Fazer pedido' })).toBeDisabled();
    expect(screen.getByText(/Falta o CEP/)).toBeInTheDocument();
  });

  it('endereço completo: "Fazer pedido" habilitado, clique revalida e abre a tela de revisão', async () => {
    const user = userEvent.setup();
    salvarCarrinho([item()]);
    salvarEndereco();
    renderCartView();

    const botao = await screen.findByRole('button', { name: 'Fazer pedido' });
    expect(botao).toBeEnabled();
    await user.click(botao);

    expect(await screen.findByText('Revisa seu pedido')).toBeInTheDocument();
    expect(revalidateCheckout).toHaveBeenCalledWith(SLUG, expect.any(Object));
  });

  it('confirmar a revisão sem sessão: abre o sheet de OTP', async () => {
    const user = userEvent.setup();
    salvarCarrinho([item()]);
    salvarEndereco();
    renderCartView();

    await user.click(await screen.findByRole('button', { name: 'Fazer pedido' }));
    await screen.findByText('Revisa seu pedido');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));

    expect(await screen.findByText('Confirma seu telefone')).toBeInTheDocument();
  });

  it('fluxo completo: revisão → OTP → pedido criado → tela de sucesso, carrinho esvaziado', async () => {
    createOrder.mockResolvedValue({
      status: 'created',
      orderId: 'order-1',
      totalCents: 3690,
      paymentMethod: 'pix',
      pix: { payload: '00020101...6304ABCD', key: 'loja@exemplo.com', keyType: 'email' },
    });
    const user = userEvent.setup();
    salvarCarrinho([item()]);
    salvarEndereco();
    renderCartView();

    await user.click(await screen.findByRole('button', { name: 'Fazer pedido' }));
    await screen.findByText('Revisa seu pedido');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    await screen.findByText('Confirma seu telefone');

    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');

    await user.type(screen.getByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar código' }));

    expect(await screen.findByText('Pedido feito! 🎉')).toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledWith(SLUG, expect.any(Object), 'token-x');

    const salvo = JSON.parse(localStorage.getItem(cartStorageKey(SLUG)) ?? '{}');
    expect(salvo.items).toEqual([]);
  });

  it('fluxo completo com dinheiro na entrega (Épico 8): escolhe o chip, informa troco, body vai com paymentMethod/changeForCents', async () => {
    createOrder.mockResolvedValue({
      status: 'created',
      orderId: 'order-cash',
      totalCents: 3690,
      paymentMethod: 'cash_on_delivery',
      changeForCents: 5000,
    });
    const user = userEvent.setup();
    salvarCarrinho([item()]);
    salvarEndereco();
    renderCartView();

    await user.click(await screen.findByRole('button', { name: 'Fazer pedido' }));
    await screen.findByText('Revisa seu pedido');

    await user.click(screen.getByRole('button', { name: 'Dinheiro na entrega' }));
    await user.click(screen.getByLabelText('Não preciso de troco')); // desmarca, abre o campo
    // fireEvent.change (não user.type char a char) — mesma razão de sempre
    // com máscara + cursor em jsdom: digitar caractere a caractere reseta o
    // cursor a cada re-mascaramento e embaralha a ordem dos dígitos. Aqui
    // testamos "o handler recebe o valor mascarado certo", não a mecânica de
    // digitação em si (essa já tem cobertura própria em mo-input.test.tsx).
    fireEvent.change(screen.getByLabelText('Troco pra quanto?'), { target: { value: '5000' } });

    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    await screen.findByText('Confirma seu telefone');
    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');
    await user.type(screen.getByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar código' }));

    expect(await screen.findByText(/Pagamento em dinheiro na entrega/)).toBeInTheDocument();
    expect(await screen.findByText(/leve troco pra R\$ 50,00/)).toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledWith(
      SLUG,
      expect.objectContaining({ paymentMethod: 'cash_on_delivery', changeForCents: 5000 }),
      'token-x',
    );
  });

  it('divergência ainda desfavorável na criação (409): volta pra revisão com os dados frescos, sem tela de sucesso', async () => {
    createOrder.mockResolvedValue({
      status: 'divergent',
      review: { ...REVIEW_PADRAO, subtotalCents: 3500, hasUnfavorableDivergence: true },
    });
    const user = userEvent.setup();
    salvarCarrinho([item()]);
    salvarEndereco();
    renderCartView();

    await user.click(await screen.findByRole('button', { name: 'Fazer pedido' }));
    await screen.findByText('Revisa seu pedido');
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    await screen.findByText('Confirma seu telefone');
    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');
    await user.type(screen.getByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar código' }));

    await screen.findByText('Revisa seu pedido');
    expect(screen.queryByText('Pedido feito! 🎉')).not.toBeInTheDocument();
    expect(screen.getByText('R$ 35,00')).toBeInTheDocument();
  });

  it('preço caiu (sem divergência desfavorável): mostra o toast, não bloqueia nada', async () => {
    revalidateCheckout.mockResolvedValue({
      ...REVIEW_PADRAO,
      items: [{ ...REVIEW_PADRAO.items[0]!, priceChanged: true, unitBasePriceCents: 2000, lineTotalCents: 2000 }],
      hasUnfavorableDivergence: false,
    });
    const user = userEvent.setup();
    salvarCarrinho([item()]);
    salvarEndereco();
    renderCartView();

    await user.click(await screen.findByRole('button', { name: 'Fazer pedido' }));

    expect(await screen.findByText(/Boa notícia/)).toBeInTheDocument();
  });

  it('changeForCents === totalCents (pago exato): tela de sucesso diz "sem troco", nunca "leve troco pra"', async () => {
    createOrder.mockResolvedValue({
      status: 'created',
      orderId: 'order-exato',
      totalCents: 3690,
      paymentMethod: 'cash_on_delivery',
      changeForCents: 3690, // exatamente o total — pagamento exato, troco zero
    });
    const user = userEvent.setup();
    salvarCarrinho([item()]);
    salvarEndereco();
    renderCartView();

    await user.click(await screen.findByRole('button', { name: 'Fazer pedido' }));
    await screen.findByText('Revisa seu pedido');
    await user.click(screen.getByRole('button', { name: 'Dinheiro na entrega' }));
    await user.click(screen.getByLabelText('Não preciso de troco')); // desmarca, abre o campo
    fireEvent.change(screen.getByLabelText('Troco pra quanto?'), { target: { value: '3690' } });
    await user.click(screen.getByRole('button', { name: 'Confirmar pedido' }));
    await screen.findByText('Confirma seu telefone');
    await user.type(screen.getByLabelText('Telefone'), '51999990000');
    await user.click(screen.getByRole('button', { name: 'Enviar código' }));
    await screen.findByText('Digite o código');
    await user.type(screen.getByLabelText('Código'), '123456');
    await user.click(screen.getByRole('button', { name: 'Confirmar código' }));

    expect(await screen.findByText(/sem troco/)).toBeInTheDocument();
    expect(screen.queryByText(/leve troco pra/)).not.toBeInTheDocument();
  });
});

describe('CartView — disponibilidade de pagamento (Ajuste 1)', () => {
  it('loja sem NENHUM método disponível: bloqueia antes de montar carrinho, mesmo com itens salvos', async () => {
    salvarCarrinho([item()]);
    renderCartView({ availablePaymentMethods: [] });

    expect(await screen.findByText('Essa loja não está recebendo pedidos agora')).toBeInTheDocument();
    expect(screen.queryByText('Seu carrinho tá vazio')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Fazer pedido' })).not.toBeInTheDocument();
  });
});
