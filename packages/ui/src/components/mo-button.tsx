'use client';

import { type VariantProps, cva } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import * as React from 'react';
import { cn } from '../lib/cn';

/**
 * MoButton — doc de marca §5.1.
 *
 * 52px de altura no mobile (dedo com pressa, cozinha em hora de pico), 44px no
 * desktop. `pix` é variante própria porque a cor do PIX é do Banco Central e
 * nunca acompanha o tema do lojista.
 */
/**
 * Exportado pra quem precisa do visual de `MoButton` num elemento que NÃO é
 * `<button>` (ex.: `<Link>` de navegação) — `MoButton` só renderiza
 * `<button>` de propósito (semântica de ação, não de link). Composição
 * direta com a variante em vez de props polimórficas tipo `asChild`: menos
 * API de superfície, mesmo resultado visual, sem depender de Radix Slot.
 */
export const buttonVariants = cva(
  [
    'relative inline-flex items-center justify-center gap-2',
    'rounded-md font-semibold',
    'transition duration-base ease-out',
    'focus-visible:outline-none focus-visible:shadow-focus',
    'active:scale-[.98]',
    // Desabilitado é um PAR DE TOKENS, não opacidade. `opacity: 40%` desbota
    // texto e fundo juntos e derruba o contraste a ~1.4:1 (medido). Assim o
    // botão lê como inativo — cinza, sem cor de marca — e continua legível.
    'disabled:bg-disabled-surface disabled:text-disabled-text',
    'disabled:cursor-not-allowed disabled:active:scale-100 disabled:hover:brightness-100',
  ],
  {
    variants: {
      variant: {
        primary: 'bg-brand text-on-brand hover:brightness-95',
        secondary: 'bg-brand-subtle text-brand-strong hover:brightness-95',
        ghost: 'bg-transparent text-brand-strong hover:bg-brand-faint',
        // O red-500 do doc só alcança 4.08:1 com branco: usa-se o tom forte.
        danger: 'bg-critical-strong text-white hover:brightness-95',
        // Confirmação positiva fora da marca (ex.: "Marcar pago" no gestor) —
        // ink-900 sobre green-500 dá 5.72:1, mesmo par do MoBadge positive.
        positive: 'bg-positive text-text hover:brightness-95',
        // A cor do PIX é do Banco Central e não se toca — o que muda é o texto.
        // Branco sobre o teal dá 2.35:1; ink dá 7.9:1.
        pix: 'bg-pix text-text hover:brightness-95',
      },
      size: {
        // O alvo de toque nunca cai abaixo de 44px (§6.1).
        md: 'h-[52px] sm:h-11 px-6 text-body-strong',
        sm: 'h-11 px-4 text-body-strong',
      },
      fullWidth: {
        true: 'w-full',
        false: '',
      },
    },
    defaultVariants: {
      variant: 'primary',
      size: 'md',
      fullWidth: false,
    },
  },
);

export interface MoButtonProps
  extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'color'>,
    VariantProps<typeof buttonVariants> {
  /** Troca o conteúdo por um spinner sem mudar a largura do botão. */
  loading?: boolean;
  /** Ícone à esquerda (20px). */
  icon?: React.ReactNode;
}

export const MoButton = React.forwardRef<HTMLButtonElement, MoButtonProps>(function MoButton(
  { className, variant, size, fullWidth, loading = false, icon, children, disabled, ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={props.type ?? 'button'}
      disabled={disabled ?? loading}
      aria-busy={loading || undefined}
      className={cn(buttonVariants({ variant, size, fullWidth }), className)}
      {...props}
    >
      {/* O conteúdo continua ocupando espaço enquanto carrega — o botão não encolhe
          nem "pula" debaixo do dedo do lojista. */}
      <span className={cn('inline-flex items-center gap-2', loading && 'invisible')}>
        {icon ? (
          <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center" aria-hidden>
            {icon}
          </span>
        ) : null}
        {children}
      </span>

      {loading ? (
        <span className="absolute inset-0 inline-flex items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
        </span>
      ) : null}
    </button>
  );
});
