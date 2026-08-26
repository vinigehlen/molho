'use client';

import { UtensilsCrossed } from 'lucide-react';
import { MoButton } from '@molho/ui';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16 text-center">
      <section className="flex max-w-md flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-brand-faint text-brand-strong">
          <UtensilsCrossed className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-title-lg text-text">O cardápio não carregou</h1>
        <p className="mt-3 text-body text-text-muted">
          Pode ser uma instabilidade rápida. Tenta novamente para voltar para a cozinha da casa.
        </p>
        <MoButton className="mt-8" onClick={reset}>
          Tentar novamente
        </MoButton>
      </section>
    </main>
  );
}
