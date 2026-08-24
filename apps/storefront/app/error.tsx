'use client';

import { UtensilsCrossed } from 'lucide-react';

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
        <button
          type="button"
          className="mt-8 inline-flex h-[52px] items-center justify-center rounded-md bg-brand px-6 text-body-strong text-on-brand transition duration-base ease-out hover:brightness-95"
          onClick={reset}
        >
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
