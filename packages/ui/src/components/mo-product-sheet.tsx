'use client';

import * as React from 'react';
import { formatCents } from '../lib/format';
import { MoButton } from './mo-button';
import { MoModifierGroup, type MoModifierOption } from './mo-modifier-group';
import { MoSheet } from './mo-sheet';
import { MoStepper } from './mo-stepper';

export interface MoProductSheetModifierGroup {
  id: string;
  name: string;
  min: number;
  max: number;
  modifiers: MoModifierOption[];
}

export interface MoProductSheetProduct {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  basePriceCents: number;
  modifierGroups: MoProductSheetModifierGroup[];
  /** Combo (fase 4.1b): o que vem dentro. Exibição pura — o preço é `basePriceCents` (fixo). */
  comboItems?: { name: string; quantity: number }[];
}

export interface MoProductSheetSelectedModifier {
  id: string;
  groupId: string;
  name: string;
  priceDeltaCents: number;
}

export interface MoProductSheetSelection {
  quantity: number;
  notes: string | null;
  modifiers: MoProductSheetSelectedModifier[];
  /** (base + soma dos deltas) × quantidade — o mesmo número já exibido no botão. */
  totalCents: number;
}

export interface MoProductSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** `null` enquanto nenhum produto foi selecionado — o sheet não renderiza. */
  product: MoProductSheetProduct | null;
  onAddToCart: (selection: MoProductSheetSelection) => void;
  className?: string;
}

/**
 * MoProductSheet — blueprint "Detalhe do produto" (doc de marca §5.3, item 2).
 *
 * Compõe MoSheet + MoModifierGroup + MoStepper + MoButton — a montagem final
 * dos componentes de fundamento e de domínio em volta de UM produto.
 *
 * Devolve os modificadores selecionados por EXTENSO (id, groupId, name,
 * priceDeltaCents), não só os ids: quem chama (o storefront, Épico 5 commit
 * 7) monta o `CartItem` do contrato direto do payload, sem precisar re-olhar
 * o catálogo pra achar nome/preço de cada modificador escolhido.
 *
 * `packages/ui` não depende de `@molho/contracts` (nenhum componente daqui
 * depende hoje) — por isso o cálculo de total abaixo REPETE a fórmula de
 * `lineTotalCents` do `packages/contracts/src/cart.ts` em vez de importá-la.
 * É só exibição: o servidor sempre revalida no checkout (Épico 7).
 */
export function MoProductSheet({ open, product, ...props }: MoProductSheetProps) {
  // Remonta por `key` ao abrir ou trocar de produto — quantidade/observações/
  // seleção voltam ao padrão pelos inicializadores do useState, sem effect que
  // "ajusta" state em cima de prop. Sem isto o segundo produto herdaria a
  // escolha do primeiro.
  if (!open || !product) return null;
  return <MoProductSheetInner key={product.id} product={product} {...props} />;
}

function MoProductSheetInner({
  onOpenChange,
  product,
  onAddToCart,
  className,
}: Omit<MoProductSheetProps, 'open' | 'product'> & { product: NonNullable<MoProductSheetProps['product']> }) {
  const [quantidade, setQuantidade] = React.useState(1);
  const [observacoes, setObservacoes] = React.useState('');
  const [selecoes, setSelecoes] = React.useState<Record<string, string[]>>({});
  const observacoesId = React.useId();

  const grupoIncompleto = product.modifierGroups.some(
    (grupo) => (selecoes[grupo.id]?.length ?? 0) < grupo.min,
  );

  const deltaSelecionado = product.modifierGroups.reduce(
    (soma, grupo) =>
      soma +
      (selecoes[grupo.id] ?? []).reduce(
        (subtotal, id) => subtotal + (grupo.modifiers.find((modificador) => modificador.id === id)?.priceDeltaCents ?? 0),
        0,
      ),
    0,
  );
  const totalCents = (product.basePriceCents + deltaSelecionado) * quantidade;

  function handleAdicionar() {
    const modifiers: MoProductSheetSelectedModifier[] = product.modifierGroups.flatMap((grupo) =>
      (selecoes[grupo.id] ?? [])
        .map((id) => grupo.modifiers.find((modificador) => modificador.id === id))
        .filter((modificador): modificador is MoModifierOption => Boolean(modificador))
        .map((modificador) => ({
          id: modificador.id,
          groupId: grupo.id,
          name: modificador.name,
          priceDeltaCents: modificador.priceDeltaCents,
        })),
    );

    onAddToCart({
      quantity: quantidade,
      notes: observacoes.trim() ? observacoes.trim() : null,
      modifiers,
      totalCents,
    });
  }

  return (
    <MoSheet
      open
      onOpenChange={onOpenChange}
      title={product.name}
      className={className}
      footer={
        <div className="flex w-full items-center gap-4">
          <MoStepper label={`Quantidade de ${product.name}`} value={quantidade} onChange={setQuantidade} min={1} />
          <MoButton fullWidth disabled={grupoIncompleto} onClick={handleAdicionar}>
            Adicionar • {formatCents(totalCents)}
          </MoButton>
        </div>
      }
    >
      {product.imageUrl ? (
        <img
          src={product.imageUrl}
          alt={`Foto de ${product.name}`}
          className="-mx-6 mb-4 aspect-video w-[calc(100%+3rem)] object-cover"
        />
      ) : null}

      {product.description ? <p className="mb-6 text-body text-text-muted">{product.description}</p> : null}

      {product.comboItems && product.comboItems.length > 0 ? (
        <div className="mb-6 rounded-[14px] border border-border p-4">
          <p className="mb-2 text-body-strong text-text">Vem com</p>
          <ul className="flex flex-col gap-1 text-body text-text-muted">
            {product.comboItems.map((item, index) => (
              <li key={`${item.name}-${index}`}>
                {item.quantity > 1 ? `${item.quantity}× ` : ''}
                {item.name}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="flex flex-col gap-6 pb-6">
        {product.modifierGroups.map((grupo) => (
          <MoModifierGroup
            key={grupo.id}
            name={grupo.name}
            min={grupo.min}
            max={grupo.max}
            options={grupo.modifiers}
            selectedIds={selecoes[grupo.id] ?? []}
            onChange={(ids) => setSelecoes((anterior) => ({ ...anterior, [grupo.id]: ids }))}
          />
        ))}

        <div>
          <label htmlFor={observacoesId} className="mb-2 block text-body-strong text-text">
            Alguma observação?
          </label>
          <textarea
            id={observacoesId}
            value={observacoes}
            onChange={(evento) => setObservacoes(evento.target.value)}
            /** Mesmo teto de `cartItemSchema.notes` em `@molho/contracts/cart.ts`. */
            maxLength={280}
            rows={3}
            placeholder="Ex.: sem cebola, por favor"
            className="w-full rounded-md border border-border-strong bg-bg-card p-3 text-body text-text transition duration-base ease-out focus-visible:outline-none focus-visible:border-brand focus-visible:shadow-focus"
          />
        </div>
      </div>
    </MoSheet>
  );
}
