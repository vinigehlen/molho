'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * MoChip — doc de marca §5.1.
 *
 * Chip de categoria e filtro. 36px de altura visual, como manda o design — mas
 * o alvo de toque tem que ser 44px (§6.1). Resolvido com um ::before invisível
 * que estica a área clicável para além da pílula, sem mexer no layout: a linha
 * de chips continua compacta e o dedo continua acertando.
 *
 * É um <button> com aria-pressed — filtro é estado, não navegação.
 */
export interface MoChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  selected?: boolean;
}

export const MoChip = React.forwardRef<HTMLButtonElement, MoChipProps>(function MoChip(
  { className, selected = false, children, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type="button"
      aria-pressed={selected}
      className={cn(
        'relative inline-flex h-9 shrink-0 items-center rounded-pill px-4',
        'text-caption transition duration-base ease-out',
        'focus-visible:outline-none focus-visible:shadow-focus',
        // Alvo de toque de 44px sem inflar a pílula (§6.1).
        'before:absolute before:inset-x-0 before:top-1/2 before:h-touch',
        'before:-translate-y-1/2 before:content-[""]',
        selected
          ? 'bg-brand-subtle text-brand-strong font-semibold'
          : 'bg-bg-card text-text-muted border border-border hover:text-text',
        'disabled:bg-disabled-surface disabled:text-disabled-text disabled:cursor-not-allowed',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});

export interface MoChipGroupProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Obrigatório: o grupo precisa dizer do que é a lista ("Categorias"). */
  label: string;
}

/** Faixa horizontal rolável de chips, com fade nas bordas. */
export function MoChipGroup({ label, className, children, ...props }: MoChipGroupProps) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn('flex gap-2 overflow-x-auto py-2', className)}
      style={{
        // O fade é máscara, não cor: não some no white-label nem no dark mode.
        maskImage: 'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
        WebkitMaskImage:
          'linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent)',
        scrollbarWidth: 'none',
      }}
      {...props}
    >
      {children}
    </div>
  );
}
