import { describe, expect, it } from 'vitest';
import { adminOrderSchema } from '@molho/contracts';
import { toAdminOrder, type AdminOrderRow } from './admin-order.repository';

const ROW: AdminOrderRow = {
  id: '018f0000-0000-7000-8000-000000000001',
  status: 'preparing',
  version: 2,
  createdAt: new Date('2026-07-26T18:30:00.000Z'),
  fulfillmentDeadlineAt: new Date('2026-07-26T19:20:00.000Z'),
  paymentMethod: 'cash_on_delivery',
  paymentStatus: 'aguardando_confirmacao',
  customerVerified: true,
  changeForCents: 5000,
  subtotalCents: 3200,
  deliveryFeeCents: 490,
  totalCents: 3690,
  currentTotalCents: null,
  fulfillmentType: 'delivery',
  deliveryLabel: 'Casa',
  deliveryStreet: 'Rua das Flores',
  deliveryNumber: '123',
  deliveryComplement: null,
  deliveryNeighborhood: 'Centro',
  deliveryCity: 'Porto Alegre',
  deliveryState: 'RS',
  deliveryPostalCode: '90000-000',
  deliveryReferencePoint: 'Perto da praça',
  deliveryPostalCodeVerified: true,
  customer: { name: 'Ana Souza' },
  items: [{ name: 'X-Salada', quantity: 2, lineTotalCents: 3200, notes: null, modifiers: [] }],
};

describe('toAdminOrder', () => {
  it('achata o endereço, puxa o nome do JOIN, Date → ISO, e casa com o contrato', () => {
    const order = toAdminOrder(ROW);

    expect(order.customerName).toBe('Ana Souza');
    expect(order.createdAt).toBe('2026-07-26T18:30:00.000Z');
    expect(order.fulfillmentDeadlineAt).toBe('2026-07-26T19:20:00.000Z');
    expect(order.delivery).toEqual({
      label: 'Casa',
      street: 'Rua das Flores',
      number: '123',
      complement: null,
      neighborhood: 'Centro',
      city: 'Porto Alegre',
      state: 'RS',
      postalCode: '90000-000',
      referencePoint: 'Perto da praça',
      postalCodeVerified: true,
    });
    expect(order.changeForCents).toBe(5000);
    expect(order.items).toEqual([{ name: 'X-Salada', quantity: 2, lineTotalCents: 3200, notes: null, modifiers: [] }]);
    // Cinto-e-suspensório: o shape mapeado é válido pro schema que vai pela rede.
    expect(adminOrderSchema.safeParse(order).success).toBe(true);
  });

  it('pedido legado preserva prazo nulo em vez de recalcular com a zona atual', () => {
    expect(toAdminOrder({ ...ROW, fulfillmentDeadlineAt: null }).fulfillmentDeadlineAt).toBeNull();
  });

  it('changeForCents null (pix/card) passa como null', () => {
    const order = toAdminOrder({ ...ROW, paymentMethod: 'pix', changeForCents: null });
    expect(order.changeForCents).toBeNull();
    expect(adminOrderSchema.safeParse(order).success).toBe(true);
  });

  it('pedido guest chega ao gestor marcado como não verificado — é o que dispara o aviso no sheet do WhatsApp', () => {
    const guest = toAdminOrder({ ...ROW, customerVerified: false });

    expect(guest.customerVerified).toBe(false);
    expect(adminOrderSchema.safeParse(guest).success).toBe(true);
  });

  it('nenhum telefone vaza no payload do board — PII só sai pelo endpoint dedicado', () => {
    expect(JSON.stringify(toAdminOrder(ROW))).not.toMatch(/phone|telefone/i);
  });

  it('CEP não verificado chega ao gestor — é o que faz o lojista conferir a taxa', () => {
    // Pedido criado com o ViaCEP mudo: a cidade que decidiu a taxa veio do
    // texto do cliente (Épico 6, Bloco 2).
    const naoVerificado = toAdminOrder({ ...ROW, deliveryPostalCodeVerified: false });

    expect(naoVerificado.delivery?.postalCodeVerified).toBe(false);
    expect(adminOrderSchema.safeParse(naoVerificado).success).toBe(true);
  });

  it('pickup chega sem endereço nenhum — fulfillmentType decide, não a presença de campo', () => {
    const pickup = toAdminOrder({
      ...ROW,
      fulfillmentType: 'pickup',
      deliveryLabel: null,
      deliveryStreet: null,
      deliveryNumber: null,
      deliveryComplement: null,
      deliveryNeighborhood: null,
      deliveryCity: null,
      deliveryState: null,
      deliveryPostalCode: null,
      deliveryReferencePoint: null,
    });

    expect(pickup.fulfillmentType).toBe('pickup');
    expect(pickup.delivery).toBeNull();
    expect(adminOrderSchema.safeParse(pickup).success).toBe(true);
  });
});
