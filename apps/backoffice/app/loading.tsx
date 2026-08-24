export default function Loading() {
  return (
    <main className="min-h-screen bg-bg p-4" aria-busy="true">
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <div className="h-4 w-24 rounded-pill bg-border" />
          <div className="mt-3 h-8 w-48 rounded-pill bg-border" />
        </div>
        <div className="h-9 w-28 rounded-pill bg-border" />
      </div>
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, column) => (
          <section key={column} className="rounded-[20px] bg-bg-card p-3">
            <div className="mb-3 h-5 w-28 rounded-pill bg-border" />
            <div className="space-y-3">
              <div className="h-28 rounded-[14px] bg-bg" />
              <div className="h-24 rounded-[14px] bg-bg" />
            </div>
          </section>
        ))}
      </div>
      <span className="sr-only">Carregando gestor.</span>
    </main>
  );
}
