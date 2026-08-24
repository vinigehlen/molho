export default function Loading() {
  return (
    <main className="min-h-screen bg-cream px-6 py-10 sm:px-10" aria-busy="true">
      <div className="mx-auto grid max-w-6xl gap-8 lg:grid-cols-2 lg:items-center">
        <section className="rounded-lg bg-brand p-8">
          <div className="h-4 w-48 rounded-pill bg-white/30" />
          <div className="mt-6 space-y-3">
            <div className="h-12 w-full rounded-md bg-white/30" />
            <div className="h-12 w-4/5 rounded-md bg-white/30" />
            <div className="h-12 w-3/5 rounded-md bg-white/30" />
          </div>
          <div className="mt-8 h-12 w-44 rounded-md bg-white/30" />
        </section>
        <section className="hidden rounded-lg bg-cream-card p-8 lg:block">
          <div className="h-5 w-36 rounded-pill bg-border" />
          <div className="mt-8 space-y-5">
            <div className="h-12 rounded-md bg-border" />
            <div className="h-12 rounded-md bg-border" />
            <div className="h-12 rounded-md bg-border" />
          </div>
        </section>
      </div>
      <span className="sr-only">Carregando página do Molho.</span>
    </main>
  );
}
