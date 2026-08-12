'use client';

import { useEffect } from 'react';
import type { AdminOrder } from '@molho/contracts';
import { isoToTime } from '../../lib/format';
import { fulfillmentLabel, ticketNumber } from '../../lib/kitchen-ticket';

/**
 * Comanda de cozinha (fallback universal do Épico 10, docs/02 §6) — sai em
 * QUALQUER impressora pelo diálogo do navegador, sem agente local nem
 * ESC/POS (isso é o resto do Épico 10, depois do 13d/14). Reimprimir a
 * qualquer momento: nada aqui é consumido nem persistido, só lido do
 * `AdminOrder` que o board já tem em mão.
 *
 * Número/hora/tipo/itens/modificadores/observação — SEM preço, SEM telefone,
 * SEM endereço (a cozinha não decide entrega, só monta o prato).
 *
 * `@media print` (globals.css) esconde `body > *` inteiro e mostra só
 * `#kitchen-ticket` — só existe UM na árvore por vez (renderizado
 * condicionalmente pelo board), então não precisa de id único por pedido.
 */
export function KitchenTicket({ order, onAfterPrint }: { order: AdminOrder; onAfterPrint: () => void }) {
  useEffect(() => {
    // `window.print()` no clique (antes deste componente montar) imprimiria a
    // tela ANTERIOR: o `setState` do board é assíncrono, e `print()` é
    // síncrono/bloqueante — dispara ANTES do React commitar o DOM novo. Aqui,
    // no efeito PÓS-commit, o ticket já está na árvore quando o diálogo abre.
    window.print();
    window.addEventListener('afterprint', onAfterPrint, { once: true });
    return () => window.removeEventListener('afterprint', onAfterPrint);
  }, [onAfterPrint]);

  return (
    <div id="kitchen-ticket" className="mx-auto max-w-sm p-4 font-mono text-sm text-black">
      <p className="text-center text-base font-bold">Pedido #{ticketNumber(order)}</p>
      <p className="text-center">{isoToTime(order.createdAt)}</p>
      <p className="mt-2 text-center font-bold">{fulfillmentLabel(order)}</p>
      <hr className="my-2 border-black" />
      <p>{order.customerName}</p>
      <hr className="my-2 border-black" />
      <ul className="flex flex-col gap-2">
        {order.items.map((item, i) => (
          <li key={i}>
            <div className="font-bold">
              {item.quantity}× {item.name}
            </div>
            {item.modifiers.length > 0 ? <div className="pl-3">+ {item.modifiers.map((m) => m.name).join(', ')}</div> : null}
            {item.notes ? <div className="pl-3">Obs: {item.notes}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
