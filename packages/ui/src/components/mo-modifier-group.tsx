'use client';

import * as React from 'react';
import { formatCentsDelta } from '../lib/format';
import { cn } from '../lib/cn';

export interface MoModifierOption {
  id: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  priceDeltaCents: number;
}

export interface MoModifierGroupProps {
  name: string;
  /** `min > 0` = grupo obrigatório. */
  min: number;
  /** Limita a seleção. `max === 1` é escolha única. */
  max: number;
  options: MoModifierOption[];
  selectedIds: string[];
  onChange: (selectedIds: string[]) => void;
  className?: string;
}

function regraDoGrupo(min: number, max: number): string {
  if (min === 0 && max === 0) return 'Opcional';
  if (min === 0) return `Escolha até ${max}`;
  if (min === max) return `Escolha ${min}`;
  if (max === 0) return `Escolha pelo menos ${min}`;
  return `Escolha de ${min} a ${max}`;
}

/**
 * MoModifierGroup — doc de marca §5.2.
 *
 * Escolha única usa o radio nativo para preservar navegação por setas e a
 * semântica anunciada por leitores de tela. Quando o grupo é opcional, uma
 * ação explícita permite voltar ao estado sem escolha sem inventar uma opção
 * falsa no cardápio do lojista.
 */
export function MoModifierGroup({
  name,
  min,
  max,
  options,
  selectedIds,
  onChange,
  className,
}: MoModifierGroupProps) {
  const escolhaUnica = max === 1;
  const nomeDoGrupoNativo = React.useId();

  function alternar(id: string, proximoEstado: boolean) {
    if (escolhaUnica) {
      // Radio nativo só dispara `change` ao MARCAR (nunca ao desmarcar via
      // reclique) — `proximoEstado` é sempre `true` aqui.
      onChange([id]);
      return;
    }

    if (proximoEstado) {
      if (max > 0 && selectedIds.length >= max) return; // guarda; a UI já desabilita
      onChange([...selectedIds, id]);
    } else {
      onChange(selectedIds.filter((selecionadoId) => selecionadoId !== id));
    }
  }

  return (
    <fieldset className={cn('m-0 w-full border-0 p-0', className)}>
      <legend className="mb-1 w-full text-left">
        <span className="block text-body-strong text-text">{name}</span>
        <span className="mt-0.5 flex items-center justify-between text-caption text-text-muted">
          <span>{regraDoGrupo(min, max)}</span>
          {max > 0 ? <span className="tnum">{selectedIds.length}/{max}</span> : null}
        </span>
      </legend>

      <div className="flex flex-col divide-y divide-border">
        {options.map((opcao) => {
          const selecionado = selectedIds.includes(opcao.id);
          const desabilitado = !selecionado && !escolhaUnica && max > 0 && selectedIds.length >= max;

          return (
            <label
              key={opcao.id}
              className={cn(
                'flex w-full items-center justify-between gap-3 py-3',
                desabilitado ? 'cursor-not-allowed' : 'cursor-pointer',
              )}
            >
              <span className="flex min-w-0 items-center gap-3">
                <input
                  type={escolhaUnica ? 'radio' : 'checkbox'}
                  name={escolhaUnica ? nomeDoGrupoNativo : undefined}
                  checked={selecionado}
                  disabled={desabilitado}
                  onChange={(evento) => alternar(opcao.id, evento.target.checked)}
                  className={cn(
                    'h-6 w-6 shrink-0 border-2 border-border-strong accent-brand',
                    escolhaUnica ? 'rounded-pill' : 'rounded-sm',
                    'focus-visible:outline-none focus-visible:shadow-focus',
                    'disabled:cursor-not-allowed',
                  )}
                />
                {opcao.imageUrl ? (
                  <img
                    src={opcao.imageUrl}
                    alt=""
                    className="h-11 w-11 shrink-0 rounded-md object-cover"
                  />
                ) : null}
                <span className="min-w-0">
                  <span className={cn('block text-body', desabilitado ? 'text-disabled-text' : 'text-text')}>
                    {opcao.name}
                  </span>
                  {opcao.description ? (
                    <span
                      className={cn(
                        'mt-0.5 block text-caption',
                        desabilitado ? 'text-disabled-text' : 'text-text-muted',
                      )}
                    >
                      {opcao.description}
                    </span>
                  ) : null}
                </span>
              </span>

              <span className={cn('text-caption tnum', desabilitado ? 'text-disabled-text' : 'text-text-muted')}>
                {formatCentsDelta(opcao.priceDeltaCents)}
              </span>
            </label>
          );
        })}
      </div>

      {escolhaUnica && min === 0 && selectedIds.length > 0 ? (
        <button
          type="button"
          onClick={() => onChange([])}
          className="mt-2 min-h-11 rounded-[14px] px-3 text-caption font-semibold text-brand-strong focus-visible:outline-none focus-visible:shadow-focus"
        >
          Remover escolha
        </button>
      ) : null}
    </fieldset>
  );
}
