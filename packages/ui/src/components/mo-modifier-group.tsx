'use client';

import * as React from 'react';
import { formatCentsDelta } from '../lib/format';
import { cn } from '../lib/cn';

export interface MoModifierOption {
  id: string;
  name: string;
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
 * Escolha única (`max === 1`) usa `<input type="radio">` NATIVO, agrupado
 * por `name` — é o mecanismo padrão do HTML pra grupo de opções mutuamente
 * exclusivas, com navegação por seta e leitor de tela anunciando "opção
 * rádio, 1 de 3" de graça. Uma primeira versão tentou simular isso com
 * `<input type="checkbox" role="radio">` pra suportar desmarcar num grupo
 * OPCIONAL (clicar um radio já marcado não dispara `change` em navegador
 * nenhum) — o axe reprovou (`aria-allowed-role`: `role="radio"` não é
 * permitido em elemento cujo papel implícito é checkbox). Corrigido para o
 * elemento nativo certo.
 *
 * Limitação aceita como consequência: um grupo OPCIONAL de escolha única
 * (`min === 0, max === 1`) não pode voltar para "nada selecionado" clicando
 * de novo na opção marcada — limitação do próprio `<input type="radio">`,
 * não deste componente. Quem precisar de um estado "nenhum" nesse tipo de
 * grupo modela como um modificador explícito na lista (ex.: "Sem troca",
 * delta R$ 0) — é dado do lojista, não comportamento do componente.
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
              <span className="flex items-center gap-3">
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
                <span className={cn('text-body', desabilitado ? 'text-disabled-text' : 'text-text')}>
                  {opcao.name}
                </span>
              </span>

              <span className={cn('text-caption tnum', desabilitado ? 'text-disabled-text' : 'text-text-muted')}>
                {formatCentsDelta(opcao.priceDeltaCents)}
              </span>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}
