import { describe, expect, it } from 'vitest';
import { fulfillmentDeadline } from './format';

describe('fulfillmentDeadline', () => {
  it('formata entrega e marca prazo vencido', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'delivery', fulfillmentDeadlineAt: '2026-08-14T18:30:00' },
        new Date('2026-08-14T18:31:00').getTime(),
      ),
    ).toEqual({ text: 'Entregar até: 18:30', overdue: true });
  });

  it('formata retirada sem marcar prazo futuro como vencido', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'pickup', fulfillmentDeadlineAt: '2026-08-14T18:30:00' },
        new Date('2026-08-14T18:29:00').getTime(),
      ),
    ).toEqual({ text: 'Retirar até: 18:30', overdue: false });
  });

  it('não inventa prazo para pedido legado', () => {
    expect(fulfillmentDeadline({ fulfillmentType: 'delivery', fulfillmentDeadlineAt: null }, Date.now())).toEqual({
      text: 'Prazo não registrado',
      overdue: false,
    });
  });
});
