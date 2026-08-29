import { UtensilsCrossed } from 'lucide-react';
import { MoSkeleton } from '@molho/ui';

export default function Loading() {
  return (
    <main className="min-h-screen bg-bg pb-24" aria-busy="true">
      <header className="bg-brand px-4 py-6 text-on-brand">
        <MoSkeleton className="bg-white/30" rounded="pill" height={28} width={160} />
        <MoSkeleton className="mt-3 bg-white/25" rounded="pill" height={20} width={224} />
      </header>
      <div className="border-b border-border px-4 py-3">
        <MoSkeleton rounded="pill" height={20} width={256} />
      </div>
      <div className="flex gap-2 overflow-hidden px-4 py-3">
        <MoSkeleton className="shrink-0" rounded="pill" height={36} width={96} />
        <MoSkeleton className="shrink-0" rounded="pill" height={36} width={112} />
        <MoSkeleton className="shrink-0" rounded="pill" height={36} width={80} />
      </div>
      <section className="p-4">
        <MoSkeleton className="mb-3" rounded="pill" height={24} width={128} />
        <div className="grid grid-cols-2 gap-4" role="status">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="rounded-md bg-bg-card p-3">
              <div className="flex aspect-square items-center justify-center rounded-md bg-brand-faint">
                <UtensilsCrossed className="h-7 w-7 text-brand-strong" aria-hidden="true" />
              </div>
              <MoSkeleton className="mt-3" rounded="pill" height={20} />
              <MoSkeleton className="mt-2 w-2/3" rounded="pill" height={16} />
            </div>
          ))}
          <span className="sr-only">Carregando cardápio.</span>
        </div>
      </section>
    </main>
  );
}
