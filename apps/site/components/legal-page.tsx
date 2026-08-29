import Link from 'next/link';
import type { ReactNode } from 'react';
import { Footer } from './footer';
import { Nav } from './nav';

export function LegalPage({ title, updatedAt, children }: { title: string; updatedAt: string; children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="bg-cream px-6 py-12 sm:px-10">
        <article className="mx-auto max-w-3xl">
          <Link className="font-mono text-caption uppercase tracking-wide text-brand-strong underline-offset-4 hover:underline" href="/">
            Voltar para o início
          </Link>
          <h1 className="mt-5 [font-family:var(--font-display)] text-display uppercase text-text">{title}</h1>
          <p className="mt-3 text-body text-text-muted">Última atualização: {updatedAt}</p>
          <div className="legal-copy mt-10 space-y-8">{children}</div>
        </article>
      </main>
      <Footer />
    </>
  );
}
