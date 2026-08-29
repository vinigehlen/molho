import Link from 'next/link';
import { UtensilsCrossed } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16 text-center">
      <section className="flex max-w-md flex-col items-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-brand-faint text-brand-strong">
          <UtensilsCrossed className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-title-lg text-text">Não encontramos esse cardápio</h1>
        <p className="mt-3 text-body text-text-muted">
          O link pode ter mudado, ou a loja pode estar fora do ar por enquanto.
        </p>
        <Link
          href="/"
          className="relative mt-8 inline-flex h-[52px] items-center justify-center gap-2 rounded-md bg-brand px-6 text-body-strong font-semibold text-on-brand transition duration-base ease-out hover:brightness-95 focus-visible:outline-none focus-visible:shadow-focus active:scale-[.98] sm:h-11"
        >
          Ir para o Molho
        </Link>
      </section>
    </main>
  );
}
