'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

/**
 * Abas de "Promoções" — o item único da sidebar agrupa Promoções, Cupons e
 * Fidelidade. Cada tela continua sendo a própria rota; esta barra é o que
 * costura as três num lugar só pro lojista.
 */
const TABS = [
  { href: '/gestor/promocoes', label: 'Promoções' },
  { href: '/gestor/cupons', label: 'Cupons' },
  { href: '/gestor/fidelidade', label: 'Fidelidade' },
];

export function PromoTabs() {
  const pathname = usePathname();
  return (
    <nav className="flex gap-1 border-b border-border" aria-label="Seções de promoções">
      {TABS.map(({ href, label }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            aria-current={active ? 'page' : undefined}
            className={`min-h-11 rounded-t-[10px] px-4 py-2.5 text-sm font-medium transition-colors ${
              active
                ? 'border-b-2 border-brand text-text'
                : 'text-text-muted hover:text-text'
            }`}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
