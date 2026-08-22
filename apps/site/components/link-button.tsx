import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '@molho/ui';

/**
 * MoButton (packages/ui) sempre renderiza um <button> — não é polimórfico
 * (sem `asChild`). A landing é toda link (CTA → signup/login, âncora de
 * seção), então isto espelha as mesmas classes/tokens de MoButton só pra
 * poder ser um <a> de verdade (SEO, sem JS pra navegar). Local a apps/site,
 * não fork do design system.
 */
const VARIANTS = {
  primary: 'bg-brand text-on-brand hover:brightness-95',
  mustard: 'bg-caution text-text hover:brightness-95',
  outline: 'border-2 border-current bg-transparent hover:bg-cream-card',
  // text-cream sobre bg-brand só dá 4.01:1 (reprova AA 4.5) — medido pelo
  // Lighthouse. text-on-brand (branco) dá 4.68:1, passa. Borda continua creme.
  'outline-cream': 'border-2 border-cream text-on-brand bg-transparent hover:bg-white/10',
} as const;

const SIZES = {
  md: 'h-[52px] sm:h-11 px-6 text-body-strong',
  sm: 'h-11 px-4 text-body-strong',
} as const;

export function LinkButton({
  href,
  variant = 'primary',
  size = 'md',
  className,
  children,
}: {
  href: string;
  variant?: keyof typeof VARIANTS;
  size?: keyof typeof SIZES;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition duration-base ease-out active:scale-[.98]',
        VARIANTS[variant],
        SIZES[size],
        className,
      )}
    >
      {children}
    </Link>
  );
}
