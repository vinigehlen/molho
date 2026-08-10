'use client';

import * as React from 'react';
import { cn } from '../lib/cn';
import { MASKS, type MaskKind } from '../lib/masks';

/**
 * MoInput — doc de marca §5.1.
 *
 * A label é SEMPRE visível acima do campo. Placeholder-como-label some quando o
 * lojista começa a digitar e é dos erros de acessibilidade mais comuns — aqui é
 * proibido por construção: a prop `label` é obrigatória.
 *
 * As máscaras BR vêm de lib/masks.ts; o componente não reimplementa nenhuma.
 */
export interface MoInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'size'> {
  /** Obrigatória: todo campo tem rótulo visível. */
  label: string;
  /** Mensagem de erro — pinta a borda e é anunciada por leitor de tela. */
  error?: string;
  /** Ajuda curta abaixo do campo. */
  hint?: string;
  /** Máscara brasileira: telefone, CPF/CNPJ, CEP ou R$. */
  mask?: MaskKind;
}

export const MoInput = React.forwardRef<HTMLInputElement, MoInputProps>(function MoInput(
  { label, error, hint, mask, id, className, onChange, ...props },
  ref,
) {
  const generatedId = React.useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-erro`;
  const hintId = `${inputId}-ajuda`;

  const handleChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      if (mask) {
        event.currentTarget.value = MASKS[mask](event.currentTarget.value);
      }
      onChange?.(event);
    },
    [mask, onChange],
  );

  // O hint some da tela quando há erro, então também sai do aria-describedby —
  // apontar para um id inexistente confunde o leitor de tela.
  const describedBy = error ? errorId : hint ? hintId : undefined;

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={inputId} className="text-body-strong text-text">
        {label}
      </label>

      <input
        ref={ref}
        id={inputId}
        onChange={handleChange}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={cn(
          'h-[52px] w-full rounded-md px-4',
          'bg-bg-card text-body text-text placeholder:text-text-disabled',
          // border-strong, não border: num campo vazio a borda é a ÚNICA pista
          // de que ali se digita, então ela precisa dos 3:1 da WCAG 1.4.11.
          // A --border (1.13:1 sobre o fundo) serve para divisor, não para campo.
          'border border-border-strong',
          'transition duration-base ease-out',
          'focus-visible:outline-none focus-visible:border-brand focus-visible:shadow-focus',
          'disabled:bg-disabled-surface disabled:text-disabled-text disabled:cursor-not-allowed',
          // read-only ≠ disabled: o valor foi preenchido por nós (CEP), o campo
          // continua focável e lido por leitor de tela — só não se edita.
          'read-only:bg-disabled-surface read-only:cursor-default',
          error && 'border-critical',
          className,
        )}
        {...props}
      />

      {/* critical-strong (e não critical): o red-500 dá 3.75:1 sobre fundo claro,
          e a mensagem de erro é justamente o texto que PRECISA ser lido. */}
      {error ? (
        <p id={errorId} role="alert" className="text-caption text-critical-strong">
          {error}
        </p>
      ) : null}

      {hint && !error ? (
        <p id={hintId} className="text-caption text-text-muted">
          {hint}
        </p>
      ) : null}
    </div>
  );
});
