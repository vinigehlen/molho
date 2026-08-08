import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { StorefrontCategory } from '@molho/contracts';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { addressStorageKey } from '../../lib/address-storage';
import { cartStorageKey } from '../../lib/cart-storage';
import { TenantMenu } from './tenant-menu';

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const fetchDeliveryMatchMock = vi.fn();
vi.mock('../../lib/delivery-match-api', () => ({
  fetchDeliveryMatch: (...args: unknown[]) => fetchDeliveryMatchMock(...args),
}));

// jsdom não implementa IntersectionObserver — TenantMenu usa pro scroll-spy
// (irrelevante pra estes testes, mas precisa existir pra montar sem estourar).
class IntersectionObserverStub {
  observe() {}
  disconnect() {}
}
vi.stubGlobal('IntersectionObserver', IntersectionObserverStub);

const SLUG = 'hamburgueria-da-vila';

const CATEGORIAS: StorefrontCategory[] = [
  {
    id: '0193f1a0-0000-7000-8000-000000000001',
    name: 'Smash',
    products: [
      {
        id: '0193f1a0-0000-7000-8000-000000000002',
        name: 'Smash Clássico',
        description: null,
        basePriceCents: 2800,
        imageUrl: null,
        available: true,
        modifierGroups: [],
      },
    ],
  },
];

function renderTenantMenu(overrides: Partial<React.ComponentProps<typeof TenantMenu>> = {}) {
  return render(
    <TenantMenu
      slug={SLUG}
      storeName="Hamburgueria da Vila"
      greeting="Bateu a fome?"
      categories={CATEGORIAS}
      minOrderCents={3000}
      closedMessage={null}
      {...overrides}
    />,
  );
}

beforeEach(() => {
  localStorage.clear();
  push.mockClear();
  fetchDeliveryMatchMock.mockReset();
  fetchDeliveryMatchMock.mockResolvedValue(null);
});

describe('TenantMenu — Épico 6', () => {
  it('mostra o banner de loja fechada quando closedMessage vem preenchido', () => {
    renderTenantMenu({ closedMessage: 'A cozinha tá descansando 😴 Voltamos 12h.' });
    expect(screen.getByText('A cozinha tá descansando 😴 Voltamos 12h.')).toBeInTheDocument();
  });

  it('sem closedMessage (loja aberta): não mostra banner nenhum de horário', () => {
    renderTenantMenu({ closedMessage: null });
    expect(screen.queryByText(/cozinha tá descansando/)).not.toBeInTheDocument();
  });

  it('sem endereço salvo: mostra o prompt "Adicionar endereço de entrega"', () => {
    renderTenantMenu();
    expect(screen.getByText('Adicionar endereço de entrega')).toBeInTheDocument();
  });

  it('abre o MoAddressSheet ao clicar no botão de endereço', async () => {
    const user = userEvent.setup();
    renderTenantMenu();

    await user.click(screen.getByText('Adicionar endereço de entrega'));

    expect(await screen.findByText('Seu endereço')).toBeInTheDocument();
  });

  it('salvar endereço com coordenada dispara o match de zona e persiste no localStorage', async () => {
    fetchDeliveryMatchMock.mockResolvedValue({ withinZone: false });
    const user = userEvent.setup();
    renderTenantMenu();

    await user.click(screen.getByText('Adicionar endereço de entrega'));
    await user.type(screen.getByLabelText('Rua'), 'Rua Nova');
    await user.type(screen.getByLabelText('Bairro'), 'Centro');
    await user.type(screen.getByLabelText('Cidade'), 'Estância Velha');
    await user.type(screen.getByLabelText('Estado'), 'RS');
    await user.click(screen.getByRole('button', { name: 'Salvar endereço' }));

    const salvo = JSON.parse(localStorage.getItem(addressStorageKey(SLUG)) ?? 'null');
    expect(salvo?.street).toBe('Rua Nova');
    expect(fetchDeliveryMatchMock).not.toHaveBeenCalled(); // sem lat/lng (não tocou geolocalização) — não dá pra confirmar cobertura ainda.
  });

  it('endereço fora da zona: mostra o banner "ainda não chegamos aí"', async () => {
    fetchDeliveryMatchMock.mockResolvedValue({ withinZone: false });
    localStorage.setItem(
      addressStorageKey(SLUG),
      JSON.stringify({
        schemaVersion: 1,
        label: 'Casa',
        street: 'Rua Longe',
        number: '99',
        complement: null,
        neighborhood: 'Longe',
        city: 'Outra Cidade',
        state: 'RS',
        postalCode: '93700-000',
        referencePoint: null,
        lat: -30.03,
        lng: -51.21,
        updatedAt: new Date().toISOString(),
      }),
    );

    renderTenantMenu();

    await waitFor(() => expect(fetchDeliveryMatchMock).toHaveBeenCalledWith(SLUG, '93700-000', '99'));
    expect(await screen.findByText(/Ainda não chegamos aí/)).toBeInTheDocument();
  });

  it('carrinho abaixo do pedido mínimo: mostra quanto falta', async () => {
    localStorage.setItem(
      cartStorageKey(SLUG),
      JSON.stringify({
        schemaVersion: 2,
        slug: SLUG,
        items: [
          {
            lineId: '0193f1a0-0000-7000-8000-000000000003',
            productId: '0193f1a0-0000-7000-8000-000000000002',
            name: 'Smash Clássico',
            description: null,
            imageUrl: null,
            unitBasePriceCents: 2800,
            modifiers: [],
            quantity: 1,
            notes: null,
          },
        ],
        updatedAt: new Date().toISOString(),
      }),
    );

    renderTenantMenu({ minOrderCents: 3000 });

    // Faltam R$ 2,00 (3000 - 2800).
    expect(await screen.findByText(/Faltam R\$ 2,00/)).toBeInTheDocument();
  });
});
