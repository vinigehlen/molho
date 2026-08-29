'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * MoBadge — doc de marca §5.1.
 *
 * O selo SEMPRE tem texto. Status de pedido nunca é comunicado só por cor
 * (§6.1): quem não distingue âmbar de verde precisa ler "Preparando".
 *
 * Cada status usa o par fundo+texto do tokens.css. O texto não é branco por
 * padrão — branco sobre o âmbar dá 2.03:1.
 */
export const ORDER_STATUS_LABELS = {
  received: 'Recebido',
  preparing: 'Preparando',
  ready: 'Pronto',
  in_transit: 'Em trânsito',
  completed: 'Concluído',
  canceled: 'Cancelado',
} as const;

export type OrderStatus = keyof typeof ORDER_STATUS_LABELS;

const badgeVariants = cva(
  'inline-flex items-center gap-2 rounded-pill px-3 py-1 text-caption font-semibold',
  {
    variants: {
      variant: {
        received: 'bg-status-received text-status-received-on',
        preparing: 'bg-status-preparing text-status-preparing-on',
        ready: 'bg-status-ready text-status-ready-on',
        in_transit: 'bg-status-in-transit text-status-in-transit-on',
        completed: 'bg-status-completed text-status-completed-on',
        canceled: 'bg-status-canceled text-status-canceled-on',

        neutral: 'bg-border text-text',
        // ink-900 sobre green-500 dá 5.72:1.
        positive: 'bg-positive text-text',
        // ink-900 sobre amber-500 dá 9.18:1 (mesmo par de --status-preparing-on).
        caution: 'bg-caution text-text',
        // critical-strong, e não critical: branco sobre o red-500 dá 4.08:1.
        critical: 'bg-critical-strong text-white',
      },
    },
    defaultVariants: { variant: 'neutral' },
  },
);

export interface MoBadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {
  /** Mostra o dot pulsante de "ao vivo" (pedido em andamento no gestor). */
  live?: boolean;
}

export function MoBadge({ className, variant, live = false, children, ...props }: MoBadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props}>
      {live ? (
        <span
          className="h-2 w-2 shrink-0 rounded-pill bg-current animate-pulse-dot"
          aria-hidden="true"
        />
      ) : null}
      {children}
    </span>
  );
}

export interface MoOrderBadgeProps extends Omit<MoBadgeProps, 'variant' | 'children'> {
  status: OrderStatus;
}

/** Atalho: o selo do status do pedido, já com o rótulo pt-BR certo. */
export function MoOrderBadge({ status, ...props }: MoOrderBadgeProps) {
  return (
    <MoBadge variant={status} {...props}>
      {ORDER_STATUS_LABELS[status]}
    </MoBadge>
  );
}
