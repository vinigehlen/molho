import { MoSkeleton } from '@molho/ui';

export default function AcompanharPedidoLoading() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-5 px-4 py-6">
      <MoSkeleton className="h-24 w-full" />
      <MoSkeleton className="h-44 w-full" />
      <MoSkeleton className="h-36 w-full" />
    </main>
  );
}
