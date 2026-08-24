'use client';

export default function Error({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16 text-center">
      <section className="max-w-xl">
        <p className="font-mono text-caption uppercase tracking-wide text-brand-strong">Algo saiu do ponto</p>
        <h1 className="mt-3 [font-family:var(--font-display)] text-display uppercase text-text">
          Não conseguimos carregar essa página.
        </h1>
        <p className="mt-4 text-body-lg text-text-muted">
          Tenta de novo em instantes. Se continuar queimando, chama a gente pelo contato do rodapé.
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
