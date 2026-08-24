import Link from 'next/link';
import { ClipboardList } from 'lucide-react';

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-6 py-16 text-center">
      <section className="flex max-w-md flex-col items-center rounded-[20px] border border-border bg-bg-card p-6 shadow-sm">
        <div className="flex h-14 w-14 items-center justify-center rounded-md bg-brand-faint text-brand-strong">
          <ClipboardList className="h-7 w-7" aria-hidden="true" />
        </div>
        <h1 className="mt-5 text-title-lg text-text">Essa tela não existe</h1>
        <p className="mt-3 text-body text-text-muted">
          Volta para o gestor e segue cuidando dos pedidos da casa.
        </p>
        <Link
          href="/gestor"
          className="mt-8 inline-flex h-[52px] items-center justify-center rounded-md bg-brand px-6 text-body-strong text-on-brand transition duration-base ease-out hover:brightness-95"
        >
          Voltar ao gestor
        </Link>
      </section>
    </main>
  );
}
