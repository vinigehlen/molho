'use client';

import { X } from 'lucide-react';
import * as React from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../lib/cn';

/**
 * MoSheet — doc de marca §5.1 e §5.3.
 *
 * Bottom sheet no mobile, painel lateral no desktop. É o padrão de camadas do
 * produto: detalhe do produto, carrinho, filtros, confirmações.
 *
 * Escrito sem Radix de propósito — a única coisa que ele traria aqui é o
 * comportamento de diálogo, que é justamente o que precisa estar sob nosso
 * controle e coberto por teste:
 *
 *   · Esc fecha · clique no overlay fecha
 *   · o foco entra no sheet ao abrir e NÃO escapa dele (Tab circula)
 *   · ao fechar, o foco VOLTA para quem abriu — quem navega por teclado não é
 *     cuspido no topo da página
 *   · o body para de rolar por baixo (o clássico "scroll fantasma" do mobile)
 */
const FOCAVEIS = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

export interface MoSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Obrigatório: é o rótulo acessível do diálogo. */
  title: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
}

export function MoSheet({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  className,
}: MoSheetProps) {
  const painelRef = React.useRef<HTMLDivElement>(null);
  const gatilhoRef = React.useRef<HTMLElement | null>(null);
  const tituloId = React.useId();
  const descricaoId = React.useId();

  // Guarda quem abriu, para devolver o foco no fim.
  React.useEffect(() => {
    if (open) {
      gatilhoRef.current = document.activeElement as HTMLElement | null;
    }
  }, [open]);

  // Trava o scroll do body enquanto o sheet está aberto.
  React.useEffect(() => {
    if (!open) return;

    const anterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    return () => {
      document.body.style.overflow = anterior;
    };
  }, [open]);

  // Foco: entra no sheet ao abrir, circula dentro dele, e volta ao gatilho.
  React.useEffect(() => {
    if (!open) return;

    const painel = painelRef.current;
    if (!painel) return;

    const primeiro = painel.querySelector<HTMLElement>(FOCAVEIS);
    (primeiro ?? painel).focus();

    const aoTeclar = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') {
        evento.stopPropagation();
        onOpenChange(false);
        return;
      }

      if (evento.key !== 'Tab') return;

      const focaveis = Array.from(painel.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (focaveis.length === 0) {
        evento.preventDefault();
        return;
      }

      const primeiroFocavel = focaveis[0]!;
      const ultimoFocavel = focaveis[focaveis.length - 1]!;
      const ativo = document.activeElement;

      // Circula: do último para o primeiro e vice-versa, sem escapar.
      if (evento.shiftKey && (ativo === primeiroFocavel || ativo === painel)) {
        evento.preventDefault();
        ultimoFocavel.focus();
      } else if (!evento.shiftKey && ativo === ultimoFocavel) {
        evento.preventDefault();
        primeiroFocavel.focus();
      }
    };

    document.addEventListener('keydown', aoTeclar);

    return () => {
      document.removeEventListener('keydown', aoTeclar);
      gatilhoRef.current?.focus();
    };
  }, [open, onOpenChange]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      {/* Overlay: cor de token, não hex. Clique fecha. */}
      <div
        className="absolute inset-0 bg-text/40"
        onClick={() => onOpenChange(false)}
        aria-hidden="true"
      />

      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={description ? descricaoId : undefined}
        tabIndex={-1}
        className={cn(
          'relative flex max-h-[90vh] w-full flex-col',
          'bg-bg-card rounded-t-xl sm:rounded-xl sm:max-w-md',
          'shadow-3 animate-sheet-in focus-visible:outline-none',
          className,
        )}
      >
        {/* Alça de arrasto: afordância de bottom sheet, só no mobile. */}
        <div className="flex justify-center pt-3 sm:hidden" aria-hidden="true">
          <span className="h-1 w-10 rounded-pill bg-border" />
        </div>

        <div className="flex items-start justify-between gap-4 p-6 pb-4">
          <div className="flex flex-col gap-1">
            <h2 id={tituloId} className="text-title text-text">
              {title}
            </h2>
            {description ? (
              <p id={descricaoId} className="text-caption text-text-muted">
                {description}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={() => onOpenChange(false)}
            aria-label="Fechar"
            className={cn(
              'inline-flex h-touch w-touch shrink-0 items-center justify-center',
              'rounded-pill text-text-muted transition duration-base ease-out',
              'hover:bg-bg hover:text-text',
              'focus-visible:outline-none focus-visible:shadow-focus',
            )}
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 text-body text-text">{children}</div>

        {footer ? <div className="flex items-center gap-3 p-6 pt-4">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}
