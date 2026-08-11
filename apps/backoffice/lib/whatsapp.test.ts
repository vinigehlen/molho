import { describe, expect, it } from 'vitest';
import type { AdminOrder } from '@molho/contracts';
import { centsToBRL } from './format';
import { orderSummary, waMeUrl, whatsappMessage } from './whatsapp';

const ORDER: AdminOrder = {
  id: '018f0000-0000-7000-8000-000000000001',
  status: 'received',
  version: 0,
  createdAt: '2026-08-10T18:30:00.000Z',
  customerName: 'Ana Souza',
  customerVerified: true,
  paymentMethod: 'pix',
  paymentStatus: 'aguardando_confirmacao',
  changeForCents: null,
  subtotalCents: 3200,
  deliveryFeeCents: 490,
  totalCents: 3690,
  delivery: {
    label: 'Casa',
    street: 'Rua das Flores',
    number: '123',
    complement: null,
    neighborhood: 'Centro',
    city: 'Porto Alegre',
    state: 'RS',
    postalCode: '90000-000',
    referencePoint: null,
    postalCodeVerified: true,
  },
  items: [
    { name: 'X-Salada', quantity: 2, lineTotalCents: 3200 },
    { name: 'Coca lata', quantity: 1, lineTotalCents: 490 },
  ],
};

describe('whatsappMessage', () => {
  it('interpola nome, resumo e total', () => {
    // `centsToBRL` no esperado, não "R$ 36,90" cravado: o Intl do pt-BR usa
    // espaço NÃO-QUEBRÁVEL depois do "R$", e cravar o espaço comum quebra o
    // teste sem que nada de errado tenha acontecido.
    expect(whatsappMessage(ORDER)).toBe(
      `Oi, Ana Souza! Confirmei seu pedido: 2× X-Salada, 1× Coca lata. Total ${centsToBRL(3690)}. Já entrou pra praça.`,
    );
  });

  it('a mensagem sai do status ATUAL — cada coluna do board tem a sua', () => {
    expect(whatsappMessage({ ...ORDER, status: 'preparing' })).toContain('Confirmei seu pedido');
    expect(whatsappMessage({ ...ORDER, status: 'ready' })).toContain('pronto pra retirada');
    expect(whatsappMessage({ ...ORDER, status: 'in_transit' })).toContain('saiu pra entrega');
  });

  it('status terminal não tem texto pronto — o sheet abre vazio, não com a mensagem errada', () => {
    expect(whatsappMessage({ ...ORDER, status: 'completed' })).toBeNull();
    expect(whatsappMessage({ ...ORDER, status: 'canceled' })).toBeNull();
  });

  it('não deixa chave crua sobrando na mensagem', () => {
    expect(whatsappMessage(ORDER)).not.toMatch(/\{\w+\}/);
  });
});

describe('orderSummary', () => {
  it('junta quantidade e nome dos itens', () => {
    expect(orderSummary(ORDER)).toBe('2× X-Salada, 1× Coca lata');
  });
});

describe('waMeUrl', () => {
  it('monta o link com dígitos e DDI, sem o "+"', () => {
    expect(waMeUrl('5551992616964', 'Oi')).toBe('https://wa.me/5551992616964?text=Oi');
  });

  it('escapa o texto editado — & e quebra de linha não podem cortar a query', () => {
    const url = waMeUrl('5551992616964', 'Arroz & feijão\nvai junto');

    expect(url).toContain('%26');
    expect(url).toContain('%0A');
    expect(new URL(url).searchParams.get('text')).toBe('Arroz & feijão\nvai junto');
  });
});
