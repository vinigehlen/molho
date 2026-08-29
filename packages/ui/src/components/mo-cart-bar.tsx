'use client';

import * as React from 'react';
import { formatCents } from '../lib/format';
import { cn } from '../lib/cn';

export interface MoCartBarProps {
  itemCount: number;
  totalCents: number;
  onClick: () => void;
  className?: string;
}

/**
 * MoCartBar — doc de marca §5.2.
 *
 * Pill fixa no rodapé. Some ao rolar pra baixo, volta ao rolar pra cima —
 * assim ela nunca cobre o botão "Adicionar" de um MoProductSheet aberto por
 * baixo, mas continua acessível assim que o cliente para de ler o cardápio.
 *
 * Carrinho vazio (`itemCount <= 0`) não renderiza nada: o chamador pode
 * montar o componente incondicionalmente, sem precisar checar o tamanho do
 * carrinho antes.
 *
 * Acessibilidade: os três pedaços visuais (contador, "Ver carrinho", total)
 * ficam `aria-hidden` e o `<button>` carrega um `aria-label` único e
 * completo — sem isso, um leitor de tela concatenaria "3 Ver carrinho R$
 * 45,00" fora de ordem gramatical.
 */
export function MoCartBar({ itemCount, totalCents, onClick, className }: MoCartBarProps) {
  const [escondida, setEscondida] = React.useState(false);
  const ultimaPosicaoRef = React.useRef(0);

  React.useEffect(() => {
    ultimaPosicaoRef.current = window.scrollY;

    function aoRolar() {
      const atual = window.scrollY;
      const diferenca = atual - ultimaPosicaoRef.current;

      // Ignora tremor de rolagem pequena (rubber-band do iOS, trackpad) — só
      // reage a um gesto de verdade, e nunca esconde perto do topo da página.
      if (Math.abs(diferenca) > 8) {
        setEscondida(diferenca > 0 && atual > 80);
        ultimaPosicaoRef.current = atual;
      }
    }

    window.addEventListener('scroll', aoRolar, { passive: true });
    return () => window.removeEventListener('scroll', aoRolar);
  }, []);

  if (itemCount <= 0) return null;

  const itens = itemCount === 1 ? '1 item' : `${itemCount} itens`;

  return (
    <div
      className={cn(
        'fixed inset-x-4 bottom-4 z-40',
        'transition duration-base ease-out',
        escondida ? 'pointer-events-none translate-y-24 opacity-0' : 'translate-y-0 opacity-100',
        className,
      )}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={`Ver carrinho: ${itens}, total ${formatCents(totalCents)}`}
        className={cn(
          'flex w-full items-center gap-3 rounded-pill bg-brand px-3 py-3 text-on-brand shadow-3',
          'transition duration-base ease-out hover:brightness-95 active:scale-[.98]',
          'focus-visible:outline-none focus-visible:shadow-focus',
        )}
      >
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-pill bg-on-brand text-body-strong text-brand-strong tnum"
        >
          {itemCount}
        </span>
        <span aria-hidden="true" className="flex-1 text-center text-body-strong">
          Ver carrinho
        </span>
        <span aria-hidden="true" className="text-body-strong tnum">
          {formatCents(totalCents)}
        </span>
      </button>
    </div>
  );
}
