import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-cream px-6 py-16 text-center">
      <section className="max-w-xl">
        <p className="font-mono text-caption uppercase tracking-wide text-brand-strong">Página não encontrada</p>
        <h1 className="mt-3 [font-family:var(--font-display)] text-display uppercase text-text">
          Esse endereço saiu do cardápio.
        </h1>
        <p className="mt-4 text-body-lg text-text-muted">
          Volta para a página inicial e segue pelo caminho certo para criar seu delivery sem comissão.
        </p>
        <Link
          href="/"
          className="mt-8 inline-flex h-[52px] items-center justify-center rounded-md bg-brand px-6 text-body-strong text-on-brand transition duration-base ease-out hover:brightness-95"
        >
          Voltar para o início
        </Link>
      </section>
    </main>
  );
}
