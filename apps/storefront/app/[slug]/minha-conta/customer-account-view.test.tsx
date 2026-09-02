import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { CustomerAccountView } from './customer-account-view';

const clearToken = vi.fn();
const { useCustomerToken, getCustomerProfile, listCustomerAddresses, listCustomerOrders, createReview } = vi.hoisted(() => ({
  useCustomerToken: vi.fn(), getCustomerProfile: vi.fn(), listCustomerAddresses: vi.fn(), listCustomerOrders: vi.fn(), createReview: vi.fn(),
}));
vi.mock('../../../lib/use-customer-token', () => ({ useCustomerToken }));
vi.mock('../../../lib/customer-profile-api', () => ({
  getCustomerProfile, listCustomerAddresses, listCustomerOrders, createReview,
  createCustomerAddress: vi.fn(), updateCustomerAddress: vi.fn(), deleteCustomerAddress: vi.fn(), updateCustomerProfile: vi.fn(),
  CustomerProfileUnauthorizedError: class extends Error {}, CustomerProfileConflictError: class extends Error {},
  ReviewAlreadyExistsError: class extends Error {},
}));

describe('CustomerAccountView', () => {
  beforeEach(() => {
    clearToken.mockReset();
    useCustomerToken.mockReturnValue({ token: null, customerId: null, setToken: vi.fn(), clearToken });
  });

  it('não pede OTP quando não existe sessão', async () => {
    render(<CustomerAccountView slug="tempero" storeName="Casa Tempero" />);
    expect(await screen.findByText('Sua conta está protegida')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Voltar pro cardápio' })).toHaveLength(2);
  });

  it('mostra perfil, endereços e pedidos da sessão autenticada', async () => {
    useCustomerToken.mockReturnValue({ token: 'token-x', customerId: 'customer-1', setToken: vi.fn(), clearToken });
    getCustomerProfile.mockResolvedValue({ id: '0193f1a0-0000-7000-8000-000000000001', name: 'Bia', phoneMasked: '(51) *****-1234', emailMasked: null, phoneVerified: true, version: 0 });
    listCustomerAddresses.mockResolvedValue([]);
    listCustomerOrders.mockResolvedValue([]);
    render(<CustomerAccountView slug="tempero" storeName="Casa Tempero" />);
    await waitFor(() => expect(screen.getByDisplayValue('Bia')).toBeInTheDocument());
    expect(screen.getByText('Telefone: (51) *****-1234')).toBeInTheDocument();
    expect(screen.getByText('Nenhum endereço salvo ainda.')).toBeInTheDocument();
    expect(screen.getByText('Seu histórico aparece aqui depois do primeiro pedido.')).toBeInTheDocument();
  });

  it('pedido completed: oferece "Avaliar pedido" e manda nota+comentário pro backend', async () => {
    const user = userEvent.setup();
    useCustomerToken.mockReturnValue({ token: 'token-x', customerId: 'customer-1', setToken: vi.fn(), clearToken });
    getCustomerProfile.mockResolvedValue({ id: '0193f1a0-0000-7000-8000-000000000001', name: 'Bia', phoneMasked: '(51) *****-1234', emailMasked: null, phoneVerified: true, version: 0 });
    listCustomerAddresses.mockResolvedValue([]);
    listCustomerOrders.mockResolvedValue([
      { id: 'order-1', status: 'completed', paymentStatus: 'confirmado', fulfillmentType: 'delivery', totalCents: 5000, createdAt: '2026-09-01T00:00:00.000Z', items: [{ name: 'X-Burger', quantity: 1 }] },
    ]);
    createReview.mockResolvedValue(undefined);

    render(<CustomerAccountView slug="tempero" storeName="Casa Tempero" />);
    await waitFor(() => expect(screen.getByText('Avaliar pedido')).toBeInTheDocument());

    await user.click(screen.getByText('Avaliar pedido'));
    await user.click(screen.getByRole('radio', { name: '5 estrelas' }));
    await user.type(screen.getByLabelText('Comentário (opcional)'), 'Muito bom!');
    await user.click(screen.getByText('Enviar avaliação'));

    await waitFor(() => expect(createReview).toHaveBeenCalledWith('tempero', 'token-x', 'order-1', { rating: 5, comment: 'Muito bom!' }));
    expect(await screen.findByText('Obrigado pela avaliação!')).toBeInTheDocument();
  });
});
