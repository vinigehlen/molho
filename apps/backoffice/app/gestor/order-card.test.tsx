import React, { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { AdminOrder } from '@molho/contracts';
import { OrderCard } from './order-card';

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function order(overrides: Partial<AdminOrder> = {}): AdminOrder {
  return {
    id: '0193f1a0-0000-7000-8000-000000000001',
    status: 'ready',
    version: 0,
    createdAt: new Date().toISOString(),
    fulfillmentDeadlineAt: null,
    customerName: 'Vinicius Gehlen',
    customerVerified: true,
    paymentMethod: 'pix',
    paymentStatus: 'confirmado',
    changeForCents: null,
    subtotalCents: 9500,
    deliveryFeeCents: 0,
    totalCents: 9500,
    currentTotalCents: null,
    fulfillmentType: 'delivery',
    destination: 'delivery',
    delivery: null,
    items: [{ name: 'Picanha Angus', quantity: 1, lineTotalCents: 9500, modifiers: [], notes: null }],
    flaggedAt: null,
    flaggedReason: null,
    lastNotifiedAt: null,
    notificationCount: 0,
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(props: Partial<React.ComponentProps<typeof OrderCard>> = {}) {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  const defaults: React.ComponentProps<typeof OrderCard> = {
    order: order(),
    pending: false,
    online: true,
    confirming: false,
    onAdvance: vi.fn(),
    onMove: vi.fn(),
    onMarkPaid: vi.fn(),
    onNotify: vi.fn(),
    onPrint: vi.fn(),
    onFlag: vi.fn(),
    onUnflag: vi.fn(),
    printFeedback: null,
    dragging: false,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
  };
  act(() => {
    root.render(<OrderCard {...defaults} {...props} />);
  });
}

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('OrderCard — barra de ação (Fase 1 do plano do gestor)', () => {
  it('pedido pronto p/ delivery: CTA é "Despachar", não a frase antiga "Saiu p/ entrega"', () => {
    render({ order: order({ status: 'ready', destination: 'delivery' }) });
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Despachar');
    expect(button).toBeTruthy();
    expect(container.textContent).not.toContain('Saiu p/ entrega');
  });

  it('pedido pronto p/ balcão: CTA é "Retirada", não a frase antiga "Pronto p/ Retirar"', () => {
    render({ order: order({ status: 'ready', destination: 'balcao' }) });
    const button = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Retirada');
    expect(button).toBeTruthy();
    expect(container.textContent).not.toContain('Pronto p/ Retirar');
  });

  it('utilitários (Imprimir/Avisar) são ícone-only com aria-label, alvo de toque 44px', () => {
    render();
    const print = container.querySelector('[aria-label="Imprimir comanda"]');
    const notify = container.querySelector('[aria-label="Avisar cliente"]');
    expect(print).toBeTruthy();
    expect(notify).toBeTruthy();
    expect(print?.className).toContain('h-11');
    expect(print?.className).toContain('w-11');
    expect(notify?.className).toContain('h-11');
    expect(notify?.className).toContain('w-11');
  });

  it('mostra o último aviso por WhatsApp sem transformar isso em status do pedido', () => {
    render({ order: order({ lastNotifiedAt: '2026-07-26T18:45:00.000', notificationCount: 2 }) });
    expect(container.textContent).toContain('Avisado');
    expect(container.textContent).toContain('18:45');
    expect(container.textContent).not.toContain('notificationCount');
  });

  it('CTA bloqueado (advanceBlockReason) usa o par de tokens disabled do MoButton, nunca opacity sobre bg-brand', () => {
    // PIX aguardando confirmação bloqueia "Preparar" (paymentGateReason) — ver order-queue.ts.
    render({
      order: order({ status: 'received', paymentMethod: 'pix', paymentStatus: 'aguardando_confirmacao' }),
    });
    const preparar = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Preparar');
    expect(preparar).toBeTruthy();
    expect((preparar as HTMLButtonElement | undefined)?.disabled).toBe(true);
    expect(preparar?.className).toContain('disabled:bg-disabled-surface');
    expect(preparar?.className).not.toContain('opacity-50');
  });

  it('"Voltar etapa" é ícone-only (44×44, aria-label) e fica na MESMA fileira dos outros ícones', () => {
    const onMove = vi.fn();
    render({ order: order({ status: 'preparing' }), onMove });
    const voltar = container.querySelector('[aria-label="Voltar etapa"]') as HTMLButtonElement | null;
    const print = container.querySelector('[aria-label="Imprimir comanda"]');
    expect(voltar).toBeTruthy();
    expect(voltar?.textContent?.trim()).toBe('');
    expect(voltar?.className).toContain('h-11');
    expect(voltar?.className).toContain('w-11');
    // mesmo pai flex que o Imprimir — ícones não misturam com botão de texto na mesma fileira.
    expect(voltar?.parentElement).toBe(print?.parentElement);
    act(() => voltar?.click());
    expect(onMove).toHaveBeenCalledWith('received');
  });

  it('CTA principal é pílula do tamanho do selo Pago (decisão consciente do lojista, abaixo do alvo de toque de 44px)', () => {
    render({ order: order({ status: 'preparing' }) });
    const pronto = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Pronto');
    const print = container.querySelector('[aria-label="Imprimir comanda"]');
    expect(pronto?.className).toContain('rounded-pill');
    expect(pronto?.className).toContain('text-caption');
    expect(pronto?.className).toContain('h-auto');
    expect(pronto?.className).not.toContain('h-11');
    // fileira separada da dos ícones (pedido do lojista: nunca mistura ícone com texto).
    expect(pronto?.parentElement).not.toBe(print?.parentElement);
  });
});

describe('OrderCard — pagamento', () => {
  it('pago: badge positive com o ícone, sem texto solto sem fundo', () => {
    render({ order: order({ paymentStatus: 'confirmado' }) });
    const badge = [...container.querySelectorAll('span')].find((s) => s.textContent?.includes('Pago'));
    expect(badge?.className).toContain('bg-positive');
  });

  it('aguardando pagamento: badge caution + "Marcar pago" usa MoButton variant=positive', () => {
    render({ order: order({ paymentStatus: 'aguardando_confirmacao', paymentMethod: 'pix' }) });
    const badge = [...container.querySelectorAll('span')].find((s) => s.textContent === 'Aguardando pagamento');
    expect(badge?.className).toContain('bg-caution');
    const marcarPago = [...container.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Marcar pago');
    expect(marcarPago?.className).toContain('bg-positive');
  });
});

describe('OrderCard — sinalização de pendência (Fase 3 do plano do gestor)', () => {
  it('pedido não sinalizado: botão chama onFlag, sem banner de destaque', () => {
    const onFlag = vi.fn();
    render({ onFlag });
    const button = container.querySelector('[aria-label="Sinalizar pedido"]') as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    expect(container.querySelector('[aria-label="Dessinalizar pedido"]')).toBeNull();
    act(() => button?.click());
    expect(onFlag).toHaveBeenCalledOnce();
  });

  it('pedido sinalizado: mostra o motivo e o botão vira "Dessinalizar", chamando onUnflag', () => {
    const onUnflag = vi.fn();
    render({
      order: order({ flaggedAt: new Date().toISOString(), flaggedReason: 'Cliente pediu troca de item por telefone' }),
      onUnflag,
    });
    expect(container.textContent).toContain('Cliente pediu troca de item por telefone');
    const button = container.querySelector('[aria-label="Dessinalizar pedido"]') as HTMLButtonElement | null;
    expect(button).toBeTruthy();
    act(() => button?.click());
    expect(onUnflag).toHaveBeenCalledOnce();
  });
});
