'use client';

import { Plus, UtensilsCrossed } from 'lucide-react';
import * as React from 'react';
import { formatCents } from '../lib/format';
import { cn } from '../lib/cn';

/**
 * MoProductCard — doc de marca §5.2.
 *
 * Duas variantes: `grid` (foto em cima, quadrada) e `list` (foto de 88px à
 * direita). "Esgotado" DESATIVA o card inteiro (spec §5.2) — não dá pra abrir
 * o detalhe nem adicionar um item que a casa não tem hoje.
 *
 * O botão "+" de adição rápida é um <button> IRMÃO do botão principal, não um
 * descendente dele — nunca aninhar <button> dentro de <button> (HTML inválido,
 * e o navegador quebra o foco do de dentro). Os dois convivem sobrepostos
 * visualmente dentro do wrapper `relative` só por posicionamento absoluto.
 *
 * Desvio deliberado da spec na variante `list`: a foto ali é só 88px — um
 * alvo de toque de 44px sobreposto cobriria a foto quase inteira. O "+" sai
 * do canto da foto e vai para a borda direita da linha, ao lado do preço.
 */
export interface MoProductCardProps {
  name: string;
  description?: string | null;
  priceCents: number;
  imageUrl?: string | null;
  /** "Esgotado manual" (definicoes-v1 §5.4). Desativa o card inteiro. */
  available?: boolean;
  variant?: 'grid' | 'list';
  /** Abre o detalhe do produto (MoProductSheet). Card inteiro é o alvo. */
  onSelect?: () => void;
  /** Adição rápida sem abrir o detalhe. Omitido = sem botão "+". */
  onQuickAdd?: () => void;
  className?: string;
}

export function MoProductCard({
  name,
  description,
  priceCents,
  imageUrl,
  available = true,
  variant = 'grid',
  onSelect,
  onQuickAdd,
  className,
}: MoProductCardProps) {
  const grid = variant === 'grid';
  const podeSelecionar = available && Boolean(onSelect);
  const podeAdicionar = available && Boolean(onQuickAdd);
  // URL assinada do R2 pode expirar/quebrar depois do card já montado — sem
  // isso, o consumidor via o ícone de imagem quebrada do navegador em vez do
  // placeholder que já existe pra "sem foto".
  const [imagemQuebrada, setImagemQuebrada] = React.useState(false);
  React.useEffect(() => {
    setImagemQuebrada(false);
  }, [imageUrl]);

  const foto = (
    <div
      className={cn(
        'relative shrink-0 overflow-hidden rounded-md bg-brand-faint',
        grid ? 'aspect-square w-full' : 'h-[88px] w-[88px]',
      )}
    >
      {imageUrl && !imagemQuebrada ? (
        <img
          src={imageUrl}
          alt={`Foto de ${name}`}
          loading="lazy"
          onError={() => setImagemQuebrada(true)}
          className={cn('h-full w-full object-cover', !available && 'grayscale')}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <UtensilsCrossed className="h-8 w-8 text-brand-strong" aria-hidden="true" />
        </div>
      )}

      {!available ? (
        <span
          className={cn(
            'absolute left-2 top-2 rounded-pill px-2 py-0.5 text-caption font-semibold',
            // Par ink-400/ink-900 já medido em AA — o mesmo do selo "cancelado".
            'bg-status-canceled text-status-canceled-on',
          )}
        >
          Esgotado
        </span>
      ) : null}
    </div>
  );

  const texto = (
    <div className={cn('flex min-w-0 flex-col gap-1', grid ? 'p-3' : 'flex-1 py-1')}>
      <span
        className={cn('line-clamp-2 text-body-strong', available ? 'text-text' : 'text-disabled-text')}
      >
        {name}
      </span>
      {description ? (
        <span className="line-clamp-2 text-caption text-text-muted">{description}</span>
      ) : null}
      <span className={cn('text-body-strong', available ? 'text-text' : 'text-disabled-text')}>
        {formatCents(priceCents)}
      </span>
    </div>
  );

  return (
    <div className={cn('relative', className)}>
      <button
        type="button"
        onClick={onSelect}
        disabled={!podeSelecionar}
        className={cn(
          'flex w-full gap-3 rounded-lg text-left',
          'transition duration-base ease-out',
          'focus-visible:outline-none focus-visible:shadow-focus',
          grid ? 'flex-col' : 'flex-row-reverse items-start',
          podeSelecionar ? 'cursor-pointer hover:shadow-2' : 'cursor-default',
        )}
      >
        {foto}
        {texto}
      </button>

      {onQuickAdd ? (
        <button
          type="button"
          onClick={onQuickAdd}
          disabled={!podeAdicionar}
          aria-label={`Adicionar ${name} ao carrinho`}
          className={cn(
            'absolute inline-flex h-touch w-touch shrink-0 items-center justify-center rounded-pill shadow-2',
            'transition duration-base ease-out active:scale-[.98]',
            'focus-visible:outline-none focus-visible:shadow-focus',
            grid ? 'bottom-2 right-2' : 'right-0 top-1/2 -translate-y-1/2',
            podeAdicionar
              ? 'bg-brand text-on-brand hover:brightness-95'
              : 'bg-disabled-surface text-disabled-text cursor-not-allowed',
          )}
        >
          <Plus className="h-5 w-5" aria-hidden="true" />
        </button>
      ) : null}
    </div>
  );
}
