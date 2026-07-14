'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * MoCard — doc de marca §5.1.
 *
 * Cantos de 20px e sombra suave: é a superfície-base do produto inteiro
 * (cardápio, comanda, métrica). A variante `interactive` renderiza um <button>
 * de verdade, não uma <div> com onClick — card clicável que não pega foco é
 * armadilha de teclado, e acessibilidade aqui é bloqueante (§6.1).
 */
const cardVariants = cva(
  ['bg-bg-card rounded-lg shadow-2', 'transition duration-base ease-out', 'text-left'],
  {
    variants: {
      padding: {
        md: 'p-4',
        lg: 'p-6',
        none: 'p-0',
      },
      interactive: {
        true: [
          'hover:shadow-3 hover:-translate-y-px',
          'focus-visible:outline-none focus-visible:shadow-focus',
          'active:translate-y-0',
        ],
        false: '',
      },
    },
    defaultVariants: {
      padding: 'md',
      interactive: false,
    },
  },
);

type CardVariants = VariantProps<typeof cardVariants>;

export interface MoCardProps
  extends Omit<React.HTMLAttributes<HTMLDivElement>, 'onClick'>,
    Omit<CardVariants, 'interactive'> {
  /** Quando presente, o card vira um <button> focável e operável por teclado. */
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  /** Força o visual interativo mesmo sem onClick (ex.: card que é um <a> por fora). */
  interactive?: boolean;
}

export const MoCard = React.forwardRef<HTMLDivElement | HTMLButtonElement, MoCardProps>(
  function MoCard({ className, padding, interactive, onClick, children, ...props }, ref) {
    const isInteractive = interactive ?? Boolean(onClick);

    if (onClick) {
      return (
        <button
          ref={ref as React.Ref<HTMLButtonElement>}
          type="button"
          onClick={onClick}
          className={cn(cardVariants({ padding, interactive: true }), 'w-full', className)}
          {...(props as React.ButtonHTMLAttributes<HTMLButtonElement>)}
        >
          {children}
        </button>
      );
    }

    return (
      <div
        ref={ref as React.Ref<HTMLDivElement>}
        className={cn(cardVariants({ padding, interactive: isInteractive }), className)}
        {...props}
      >
        {children}
      </div>
    );
  },
);

export function MoCardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex flex-col gap-1', className)} {...props} />;
}

export function MoCardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn('text-title text-text', className)} {...props} />;
}

export function MoCardDescription({
  className,
  ...props
}: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn('text-caption text-text-muted', className)} {...props} />;
}

export function MoCardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('text-body text-text', className)} {...props} />;
}

export function MoCardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn('flex items-center gap-3', className)} {...props} />;
}
