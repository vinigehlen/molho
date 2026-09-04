'use client';

import * as React from 'react';
import { Star } from 'lucide-react';
import { cn, MoButton, MoInput } from '@molho/ui';

/**
 * Nota 1-5 + comentário opcional (D1: imutável, sem editar depois de
 * enviar). Compartilhado entre o fluxo autenticado (`minha-conta`) e o
 * convite por link de acompanhamento — pedido guest (`acompanhar/[token]`,
 * Épico 16.3) — a UI de avaliar é a mesma nos dois, só muda pra QUEM o
 * `onSubmit` manda o resultado.
 */
export function OrderReviewForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (rating: number, comment: string) => void;
}) {
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Nota do pedido">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} estrela${value > 1 ? 's' : ''}`}
            onClick={() => setRating(value)}
            className="-m-1 p-1"
          >
            <Star
              className={cn('h-6 w-6', value <= rating ? 'fill-brand text-brand' : 'text-border-strong')}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <MoInput
        label="Comentário (opcional)"
        value={comment}
        onChange={(e) => setComment(e.currentTarget.value)}
      />
      <div className="flex gap-2">
        <MoButton size="sm" disabled={rating === 0} onClick={() => onSubmit(rating, comment)}>
          Enviar avaliação
        </MoButton>
        <MoButton variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </MoButton>
      </div>
    </div>
  );
}
