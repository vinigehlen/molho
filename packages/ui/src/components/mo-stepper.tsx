'use client';

import { Minus, Plus } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * MoStepper — doc de marca §5.1.
 *
 * Controle de quantidade: dois botões circulares de 44px e o número no meio,
 * tabular (não "pula" ao passar de 9 para 10).
 *
 * O valor é anunciado por role="status": quem usa leitor de tela precisa ouvir
 * "3" ao tocar no +, e não descobrir depois, no carrinho.
 */
export interface MoStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  disabled?: boolean;
  /** O que está sendo contado ("Quantidade de Filé à parmegiana"). */
  label: string;
  className?: string;
}

export function MoStepper({
  value,
  onChange,
  min = 1,
  max,
  disabled = false,
  label,
  className,
}: MoStepperProps) {
  const noMinimo = value <= min;
  const noMaximo = max !== undefined && value >= max;

  const botao = cn(
    'inline-flex h-touch w-touch shrink-0 items-center justify-center',
    'rounded-pill bg-brand-subtle text-brand-strong',
    'transition duration-base ease-out',
    'hover:brightness-95 active:scale-[.98]',
    'focus-visible:outline-none focus-visible:shadow-focus',
    'disabled:bg-disabled-surface disabled:text-disabled-text',
    'disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:brightness-100',
  );

  return (
    <div role="group" aria-label={label} className={cn('inline-flex items-center gap-4', className)}>
      <button
        type="button"
        className={botao}
        onClick={() => onChange(value - 1)}
        disabled={disabled || noMinimo}
        aria-label="Tirar um"
      >
        <Minus className="h-5 w-5" aria-hidden />
      </button>

      <span role="status" aria-live="polite" className="min-w-8 text-center text-title text-text tnum">
        {value}
      </span>

      <button
        type="button"
        className={botao}
        onClick={() => onChange(value + 1)}
        disabled={disabled || noMaximo}
        aria-label="Colocar mais um"
      >
        <Plus className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
