import { describe, expect, it } from 'vitest';
import { brlToCents, fulfillmentDeadline } from './format';

describe('brlToCents', () => {
  it.each([
    ['R$ 1.234,56', 123456],
    ['12,34', 1234],
    ['12.34', 1234],
    ['1.234', 123400],
  ])('converte %s sem perder separador de milhar', (value, expected) => {
    expect(brlToCents(value)).toBe(expected);
  });
});

describe('fulfillmentDeadline', () => {
  it('formata entrega e marca prazo vencido (severity critical)', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'delivery', fulfillmentDeadlineAt: '2026-08-14T18:30:00' },
        new Date('2026-08-14T18:31:00').getTime(),
      ),
    ).toEqual({ text: 'Entregar até: 18:30', overdue: true, severity: 'critical' });
  });

  it('formata retirada sem marcar prazo futuro como vencido (severity ok, sem createdAt)', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'pickup', fulfillmentDeadlineAt: '2026-08-14T18:30:00' },
        new Date('2026-08-14T18:29:00').getTime(),
      ),
    ).toEqual({ text: 'Retirar até: 18:30', overdue: false, severity: 'ok' });
  });

  it('não inventa prazo para pedido legado', () => {
    expect(fulfillmentDeadline({ fulfillmentType: 'delivery', fulfillmentDeadlineAt: null }, Date.now())).toEqual({
      text: 'Prazo não registrado',
      overdue: false,
      severity: 'ok',
    });
  });

  it('antes da metade do prazo: severity ok', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'delivery', fulfillmentDeadlineAt: '2026-08-14T19:00:00', createdAt: '2026-08-14T18:00:00' },
        new Date('2026-08-14T18:20:00').getTime(), // 20min de 60min — 33%
      ).severity,
    ).toBe('ok');
  });

  it('depois da metade do prazo (ainda não vencido): severity warning', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'delivery', fulfillmentDeadlineAt: '2026-08-14T19:00:00', createdAt: '2026-08-14T18:00:00' },
        new Date('2026-08-14T18:45:00').getTime(), // 45min de 60min — 75%
      ).severity,
    ).toBe('warning');
  });

  it('exatamente na metade do prazo: já vira warning (borda inclusiva)', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'delivery', fulfillmentDeadlineAt: '2026-08-14T19:00:00', createdAt: '2026-08-14T18:00:00' },
        new Date('2026-08-14T18:30:00').getTime(), // exatos 50%
      ).severity,
    ).toBe('warning');
  });

  it('vencido sempre é critical, mesmo com createdAt disponível', () => {
    expect(
      fulfillmentDeadline(
        { fulfillmentType: 'delivery', fulfillmentDeadlineAt: '2026-08-14T19:00:00', createdAt: '2026-08-14T18:00:00' },
        new Date('2026-08-14T19:05:00').getTime(),
      ).severity,
    ).toBe('critical');
  });
});
