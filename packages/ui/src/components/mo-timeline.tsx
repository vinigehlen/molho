'use client';

import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * MoTimeline — doc de marca §5.1 e §5.3.
 *
 * A timeline do acompanhamento do pedido. Dot de 12px, linha de 2px, e o dot do
 * passo atual pulsa.
 *
 * Duas regras de acessibilidade mandam aqui e não são negociáveis (§6.1):
 *
 * 1. O estado de cada passo é TEXTO, não só cor. Quem não distingue verde de
 *    cinza continua sabendo o que já aconteceu — via sr-only "concluído" /
 *    "em andamento" / "pendente".
 * 2. Mudança de status é anunciada (aria-live="polite"). O cliente não fica
 *    olhando a tela esperando: o leitor de tela avisa quando a comanda anda.
 */
export interface MoTimelineStep {
  id: string;
  label: string;
  description?: string;
  /** Quando aconteceu ("há 4 min", "19:42"). */
  at?: string;
}

export interface MoTimelineProps extends React.HTMLAttributes<HTMLOListElement> {
  steps: MoTimelineStep[];
  /** Índice do passo atual. Antes dele = concluído; depois = pendente. */
  currentIndex: number;
}

const ESTADO_TEXTO = {
  concluido: 'concluído',
  atual: 'em andamento',
  pendente: 'pendente',
} as const;

export function MoTimeline({ steps, currentIndex, className, ...props }: MoTimelineProps) {
  return (
    <ol aria-live="polite" className={cn('flex flex-col', className)} {...props}>
      {steps.map((step, i) => {
        const estado = i < currentIndex ? 'concluido' : i === currentIndex ? 'atual' : 'pendente';
        const ultimo = i === steps.length - 1;

        return (
          <li
            key={step.id}
            aria-current={estado === 'atual' ? 'step' : undefined}
            className="flex gap-4"
          >
            {/* Trilho: o dot e a linha que desce até o próximo passo. */}
            <div className="flex flex-col items-center" aria-hidden="true">
              <span
                className={cn(
                  'mt-1 h-3 w-3 shrink-0 rounded-pill',
                  estado === 'concluido' && 'bg-positive',
                  estado === 'atual' && 'bg-brand animate-pulse-dot',
                  estado === 'pendente' && 'bg-border',
                )}
              />
              {!ultimo ? (
                <span
                  className={cn(
                    'w-0.5 flex-1',
                    estado === 'concluido' ? 'bg-positive' : 'bg-border',
                  )}
                />
              ) : null}
            </div>

            <div className={cn('flex flex-col gap-1', ultimo ? 'pb-0' : 'pb-6')}>
              <span
                className={cn(
                  'text-body-strong',
                  estado === 'pendente' ? 'text-text-muted' : 'text-text',
                )}
              >
                {step.label}
                {/* O estado também é texto — nunca só cor. */}
                <span className="sr-only"> ({ESTADO_TEXTO[estado]})</span>
              </span>

              {step.description ? (
                <span className="text-caption text-text-muted">{step.description}</span>
              ) : null}

              {step.at ? <span className="text-caption text-text-muted tnum">{step.at}</span> : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
