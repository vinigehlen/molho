import { MoSkeleton } from '@molho/ui';

/**
 * Sem isto, `/{slug}/minha-conta` herdava o skeleton de cardápio de
 * `app/loading.tsx` no primeiro carregamento (RSC ainda buscando a loja) —
 * forma errada pra uma tela sem grade de produto nenhuma. Formato aqui
 * espelha `AccountShell` (customer-account-view.tsx): cabeçalho + cartões.
 */
export default function Loading() {
  return (
    <div className="mx-auto min-h-screen max-w-2xl bg-bg px-4 pb-12" aria-busy="true">
      <header className="-mx-4 mb-6 flex items-center gap-3 bg-brand px-4 py-5 text-on-brand">
        <MoSkeleton className="bg-white/30" rounded="pill" height={20} width={20} />
        <div className="flex flex-col gap-2">
          <MoSkeleton className="bg-white/25" rounded="pill" height={14} width={100} />
          <MoSkeleton className="bg-white/30" rounded="pill" height={24} width={140} />
        </div>
      </header>
      <div className="flex flex-col gap-8" role="status">
        <MoSkeleton className="h-48 w-full" />
        <span className="sr-only">Carregando sua conta.</span>
      </div>
    </div>
  );
}
