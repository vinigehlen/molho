import { MoSkeleton } from '@molho/ui';

/**
 * Sem loading.tsx próprio aqui, o Next usa o de `app/loading.tsx` (formato de
 * cardápio) pra ESTA rota também — skeleton de categoria/produto num lugar
 * que vai virar lista de carrinho + barra de total fixa. Mesmo raciocínio do
 * loading.tsx raiz: sempre skeleton, nunca spinner de página inteira.
 */
export default function Loading() {
  return (
    <div className="mx-auto flex min-h-screen max-w-2xl flex-col pb-44" aria-busy="true">
      <header className="flex flex-col gap-2 bg-brand px-4 py-6 text-on-brand">
        <MoSkeleton className="bg-white/25" rounded="pill" height={14} width={120} />
        <MoSkeleton className="bg-white/30" rounded="pill" height={28} width={160} />
        <MoSkeleton className="bg-white/25" rounded="pill" height={18} width={140} />
      </header>

      <div className="border-b border-border px-4 py-3">
        <MoSkeleton rounded="pill" height={36} width={224} />
      </div>

      <div className="border-b border-border px-4 py-3">
        <MoSkeleton rounded="pill" height={20} width={192} />
      </div>

      <div className="flex flex-col divide-y divide-border px-4" role="status">
        {Array.from({ length: 2 }, (_, index) => (
          <div key={index} className="flex gap-3 py-4">
            <MoSkeleton height={72} width={72} />
            <div className="flex flex-1 flex-col gap-2 pt-1">
              <MoSkeleton rounded="pill" height={18} width={160} />
              <MoSkeleton rounded="pill" height={14} width={110} />
            </div>
          </div>
        ))}
        <span className="sr-only">Carregando seu carrinho.</span>
      </div>

      <div className="fixed inset-x-0 bottom-0 flex flex-col gap-3 border-t border-border bg-bg-card p-4">
        <div className="mx-auto flex w-full max-w-md items-center justify-between">
          <MoSkeleton rounded="pill" height={20} width={80} />
          <MoSkeleton rounded="pill" height={20} width={72} />
        </div>
        <div className="mx-auto w-full max-w-md">
          <MoSkeleton height={48} />
        </div>
      </div>
    </div>
  );
}
