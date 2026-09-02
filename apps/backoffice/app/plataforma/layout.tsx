'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { LogOut } from 'lucide-react';
import { getStaffSession, subscribeStaffSessionClear } from '../../lib/staff-session';
import { logoutStaffSession, refreshStaffSession } from '../../lib/staff-auth';

/**
 * Layout do super-admin (Épico 14.5). Deliberadamente mais simples que
 * `/gestor/layout.tsx`: sem sidebar de tenant, sem SSE, sem fila offline —
 * nenhum desses conceitos existe em contexto de plataforma. A checagem de
 * sessão é a mesma ideia (restaura via refresh cookie se não tem sessão em
 * memória), só sem os pendores tenant-scoped.
 */
export default function PlataformaLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(getStaffSession()?.tenantId === 'platform');

  const restore = useCallback(() => {
    void refreshStaffSession().then((session) => {
      if (session?.tenantId === 'platform') setReady(true);
      else router.replace('/login');
    });
  }, [router]);

  useEffect(() => {
    if (getStaffSession()?.tenantId !== 'platform') restore();
  }, [restore]);

  useEffect(
    () =>
      subscribeStaffSessionClear(() => {
        setReady(false);
        router.replace('/login');
      }),
    [router],
  );

  async function handleLogout() {
    await logoutStaffSession();
    router.replace('/login');
  }

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6">
        <div className="h-44 w-full max-w-sm animate-pulse rounded-[20px] bg-bg-card" aria-busy="true" />
      </main>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-bg">
      <header className="flex items-center justify-between border-b border-border bg-bg-card px-6 py-4">
        <h1 className="text-title text-text">Molho · Plataforma</h1>
        <button
          type="button"
          onClick={() => void handleLogout()}
          className="flex items-center gap-2 text-body-strong text-critical-strong underline-offset-2 hover:underline"
        >
          <LogOut className="h-4 w-4" aria-hidden="true" />
          Sair
        </button>
      </header>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}
