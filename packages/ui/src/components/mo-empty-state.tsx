'use client';

import { UtensilsCrossed } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';
import { MoButton } from './mo-button';

/**
 * MoEmptyState — doc de marca §5.1.
 *
 * Vazio não é erro: é convite. A copy vem do léxico (§2.3) — "Nenhum prato por
 * aqui ainda. Que tal cadastrar o carro-chefe da casa?" — nunca "Nenhum
 * registro encontrado".
 */
export interface MoEmptyStateProps extends React.HTMLAttributes<HTMLDivElement> {
  title: string;
  description?: string;
  /** Ilustração de 160px. Sem ela, cai num ícone dentro de um círculo da marca. */
  illustration?: React.ReactNode;
  action?: {
    label: string;
    onClick: () => void;
  };
}

export function MoEmptyState({
  title,
  description,
  illustration,
  action,
  className,
  ...props
}: MoEmptyStateProps) {
  return (
    <div
      className={cn('mx-auto flex max-w-sm flex-col items-center gap-4 text-center', className)}
      {...props}
    >
      <div className="flex h-40 w-40 items-center justify-center" aria-hidden="true">
        {illustration ?? (
          <div className="flex h-24 w-24 items-center justify-center rounded-pill bg-brand-faint">
            <UtensilsCrossed className="h-10 w-10 text-brand-strong" />
          </div>
        )}
      </div>

      <h2 className="text-title text-text">{title}</h2>

      {description ? <p className="text-body text-text-muted">{description}</p> : null}

      {action ? (
        <MoButton onClick={action.onClick} className="mt-2">
          {action.label}
        </MoButton>
      ) : null}
    </div>
  );
}
