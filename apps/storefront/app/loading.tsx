import { UtensilsCrossed } from 'lucide-react';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg pb-24" aria-busy="true">
      <header className="bg-brand px-4 py-6 text-on-brand">
        <div className="h-7 w-40 rounded-pill bg-white/30" />
        <div className="mt-3 h-5 w-56 rounded-pill bg-white/25" />
      </header>
      <div className="border-b border-border px-4 py-3">
        <div className="h-5 w-64 rounded-pill bg-border" />
      </div>
      <div className="flex gap-2 overflow-hidden px-4 py-3">
        <div className="h-9 w-24 shrink-0 rounded-pill bg-border" />
        <div className="h-9 w-28 shrink-0 rounded-pill bg-border" />
        <div className="h-9 w-20 shrink-0 rounded-pill bg-border" />
      </div>
      <section className="p-4">
        <div className="mb-3 h-6 w-32 rounded-pill bg-border" />
        <div className="grid grid-cols-2 gap-4">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-md bg-bg-card p-3">
              <div className="flex aspect-square items-center justify-center rounded-md bg-brand-faint">
                <UtensilsCrossed className="h-7 w-7 text-brand-strong" aria-hidden="true" />
              </div>
              <div className="mt-3 h-5 rounded-pill bg-border" />
              <div className="mt-2 h-4 w-2/3 rounded-pill bg-border" />
            </div>
          ))}
        </div>
      </section>
      <span className="sr-only">Carregando cardápio.</span>
    </main>
  );
}
