'use client';

import { UtensilsCrossed } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { formatCents, MoEmptyState, MoStepper } from '@molho/ui';
import { lineTotalCents } from '../../../lib/cart-storage';
import { useCart } from '../../../lib/use-cart';

export interface CartViewProps {
  slug: string;
  storeName: string;
  emptyTitle: string;
  emptyBody: string;
  emptyActionLabel: string;
}

/**
 * View do carrinho — commit 8 (dead-end, ver comentário em `page.tsx`).
 * `useCart` é a mesma fonte de verdade do `TenantMenu`: sai de uma página,
 * entra na outra, o carrinho é o mesmo (localStorage, sem Context).
 */
export function CartView({ slug, storeName, emptyTitle, emptyBody, emptyActionLabel }: CartViewProps) {
  const cart = useCart(slug);
  const router = useRouter();

  if (cart.cart.items.length === 0) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-6">
        <MoEmptyState
          title={emptyTitle}
          description={emptyBody}
          action={{ label: emptyActionLabel, onClick: () => router.push(`/${slug}`) }}
        />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col pb-32">
      <header className="flex flex-col gap-1 bg-brand px-4 py-6 text-on-brand">
        <Link href={`/${slug}`} className="text-caption underline-offset-2 hover:underline">
          ← Voltar pro cardápio
        </Link>
        <h1 className="text-title-lg">Seu carrinho</h1>
        <p className="text-body opacity-90">{storeName}</p>
      </header>

      <div className="flex flex-1 flex-col divide-y divide-border px-4">
        {cart.cart.items.map((item) => (
          <div key={item.lineId} className="flex flex-col gap-3 py-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex flex-1 gap-3">
                {/* Mesmo padrão visual do card de produto (rounded-md, bg-brand-faint, ícone de fallback) — ver MoProductCard. */}
                <div className="relative h-[72px] w-[72px] shrink-0 overflow-hidden rounded-md bg-brand-faint">
                  {item.imageUrl ? (
                    <img src={item.imageUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <UtensilsCrossed className="h-6 w-6 text-brand-strong" aria-hidden="true" />
                    </div>
                  )}
                </div>

                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-body-strong text-text">{item.name}</span>
                  {item.description ? (
                    <span className="line-clamp-2 text-caption text-text-muted">{item.description}</span>
                  ) : null}
                  {item.modifiers.length > 0 ? (
                    <span className="text-caption text-text-muted">
                      {item.modifiers.map((modificador) => modificador.name).join(', ')}
                    </span>
                  ) : null}
                  {item.notes ? <span className="text-caption text-text-muted">"{item.notes}"</span> : null}
                </div>
              </div>

              <button
                type="button"
                onClick={() => cart.removeItem(item.lineId)}
                className="shrink-0 text-caption font-semibold text-critical-strong underline-offset-2 hover:underline"
              >
                Remover
              </button>
            </div>

            <div className="flex items-center justify-between">
              <MoStepper
                value={item.quantity}
                onChange={(quantidade) => cart.updateQuantity(item.lineId, quantidade)}
                min={1}
                label={`Quantidade de ${item.name}`}
              />
              <span className="text-body-strong tnum text-text">{formatCents(lineTotalCents(item))}</span>
            </div>
          </div>
        ))}
      </div>

      <div className="fixed inset-x-0 bottom-0 border-t border-border bg-bg-card p-4">
        <div className="mx-auto flex max-w-md items-center justify-between text-title text-text">
          <span>Subtotal</span>
          <span className="tnum">{formatCents(cart.subtotalCents)}</span>
        </div>
      </div>
    </div>
  );
}
