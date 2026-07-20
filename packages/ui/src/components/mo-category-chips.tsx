'use client';

import { cn } from '../lib/cn';
import { MoChip, MoChipGroup } from './mo-chip';

export interface MoCategoryChipsProps {
  categories: { id: string; name: string }[];
  activeId: string | null;
  onSelect: (id: string) => void;
  className?: string;
}

/**
 * MoCategoryChips — blueprint da Home do storefront (doc de marca §5.3, item 1).
 *
 * Wrapper fino de domínio sobre MoChipGroup/MoChip (§5.1): a única coisa que
 * adiciona é a posição STICKY logo abaixo do cabeçalho, com fundo sólido —
 * sem ele, o conteúdo rolando por baixo aparece atrás dos chips e a faixa
 * perde legibilidade.
 */
export function MoCategoryChips({ categories, activeId, onSelect, className }: MoCategoryChipsProps) {
  if (categories.length === 0) return null;

  return (
    <div className={cn('sticky top-0 z-30 bg-bg px-4', className)}>
      <MoChipGroup label="Categorias do cardápio">
        {categories.map((categoria) => (
          <MoChip key={categoria.id} selected={categoria.id === activeId} onClick={() => onSelect(categoria.id)}>
            {categoria.name}
          </MoChip>
        ))}
      </MoChipGroup>
    </div>
  );
}
