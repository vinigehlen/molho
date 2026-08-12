import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { FulfillmentAddressMismatchError } from '../order-errors';
import { CheckoutRequestDto, toCheckoutRequest } from './checkout-request.dto';

const ITEMS = [{ productId: 'p1', unitBasePriceCents: 100, modifiers: [], quantity: 1, notes: null }];
const ADDRESS = {
  label: 'Casa',
  postalCode: '90000-000',
  number: '10',
  complement: null,
  street: 'Rua X',
  neighborhood: 'Centro',
  city: 'Porto Alegre',
  state: 'RS',
  referencePoint: null,
  expectedDeliveryFeeCents: null,
};

function dto(overrides: Partial<CheckoutRequestDto>): CheckoutRequestDto {
  return Object.assign(new CheckoutRequestDto(), {
    items: ITEMS,
    fulfillmentType: 'delivery',
    address: ADDRESS,
    paymentMethod: 'pix',
    ...overrides,
  });
}

/**
 * `checkoutRequestSchema.refine` (@molho/contracts) é só documentação de
 * forma — nunca roda em runtime na API. `toCheckoutRequest` é quem checa de
 * verdade, na fronteira DTO → domínio.
 */
describe('toCheckoutRequest — retirada no balcão', () => {
  it('delivery com endereço: passa', () => {
    const request = toCheckoutRequest(dto({}));
    expect(request.fulfillmentType).toBe('delivery');
    expect(request.address).toEqual(ADDRESS);
  });

  it('pickup sem endereço: passa', () => {
    const request = toCheckoutRequest(dto({ fulfillmentType: 'pickup', address: null }));
    expect(request.fulfillmentType).toBe('pickup');
    expect(request.address).toBeNull();
  });

  it('delivery SEM endereço: FulfillmentAddressMismatchError', () => {
    expect(() => toCheckoutRequest(dto({ address: null }))).toThrow(FulfillmentAddressMismatchError);
  });

  it('pickup COM endereço: FulfillmentAddressMismatchError (nunca ignora em silêncio)', () => {
    expect(() => toCheckoutRequest(dto({ fulfillmentType: 'pickup' }))).toThrow(FulfillmentAddressMismatchError);
  });
});
