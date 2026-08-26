'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

export interface MoToastProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  message: string;
  /** Some sozinho depois deste tempo — toast é só informativo, nunca exige ação (CLAUDE.md regra 14: "preço caiu... segue direto"). */
  durationMs?: number;
  className?: string;
}

/**
 * MoToast — notificação não-bloqueante, some sozinha. Único uso hoje:
 * checkout do storefront avisando "preço caiu"/"taxa caiu" sem pedir
 * confirmação nenhuma (o oposto de MoCheckoutReviewSheet, que EXIGE toque
 * explícito quando a divergência é desfavorável).
 *
 * Mensagem só fica no DOM enquanto `open` — evita o leitor de tela anunciar
 * texto obsoleto quando reaparecer com uma mensagem nova.
 */
export function MoToast({ open, onOpenChange, message, durationMs = 4000, className }: MoToastProps) {
  // Pausa no hover/focus: ler a mensagem não pode ser uma corrida contra o
  // timer. Sem botão de fechar de propósito — o toast é só informativo, nunca
  // exige ação (regra 14), então não ganha uma affordance que sugere o contrário.
  const [pausado, setPausado] = React.useState(false);

  React.useEffect(() => {
    if (!open || pausado) return;
    const id = setTimeout(() => onOpenChange(false), durationMs);
    return () => clearTimeout(id);
  }, [open, pausado, durationMs, onOpenChange]);

  return (
    <div
      aria-hidden={!open}
      onMouseEnter={() => setPausado(true)}
      onMouseLeave={() => setPausado(false)}
      onFocus={() => setPausado(true)}
      onBlur={() => setPausado(false)}
      className={cn(
        'fixed inset-x-4 bottom-24 z-50 sm:inset-x-auto sm:right-4 sm:max-w-sm',
        'transition duration-base ease-out',
        open ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-4 opacity-0',
        className,
      )}
    >
      <div role="status" aria-live="polite" className="rounded-md bg-text px-4 py-3 text-body text-bg-card shadow-3">
        {open ? message : null}
      </div>
    </div>
  );
}
