'use client';

import { useCallback, useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { getStaffSession, subscribeStaffSessionClear } from '../../lib/staff-session';
import { refreshStaffSession } from '../../lib/staff-auth';
import { performStaffLogout } from '../../lib/staff-logout';
import { useReachability } from '../../lib/reachability';
import { useSidebarState } from '../../lib/use-sidebar-state';
import { Sidebar } from './sidebar';

export default function GestorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(getStaffSession() !== null);
  const [offline, setOffline] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  const online = useReachability();
  const sidebar = useSidebarState();

  const restore = useCallback(() => {
    setOffline(false);
    void refreshStaffSession()
      .then((session) => {
        if (session) setReady(true);
        else router.replace('/login');
      })
      .catch(() => setOffline(true));
  }, [router]);

  useEffect(() => {
    if (!getStaffSession()) restore();
  }, [restore]);

  useEffect(
    () =>
      subscribeStaffSessionClear(() => {
        setReady(false);
        router.replace('/login');
      }),
    [router],
  );

  if (!ready) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-bg p-6" aria-busy={!offline}>
        {offline ? (
          <section className="w-full max-w-sm rounded-[20px] border border-border bg-bg-card p-6 text-center">
            <h1 className="text-lg font-semibold text-text">Sem conexão com o Molho</h1>
            <p className="mt-2 text-sm text-text-muted">Confira a internet e tente de novo.</p>
            <button className="mt-4 rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand" onClick={restore}>
              Tentar novamente
            </button>
          </section>
        ) : (
          <div className="h-44 w-full max-w-sm animate-pulse rounded-[20px] bg-bg-card" />
        )}
      </main>
    );
  }

  const session = getStaffSession();

  async function handleLogout() {
    setLoggingOut(true);
    setLogoutError(null);
    const result = await performStaffLogout({
      tenantId: session?.tenantId ?? null,
      userId: session?.userId ?? null,
      online,
      pending: null,
      sync: null,
      confirmDiscard: (message) => window.confirm(message),
    });
    if (result.ok) {
      router.replace('/login');
      return;
    }
    setLoggingOut(false);
    if (result.message) setLogoutError(result.message);
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <Sidebar
        tenantName={session?.tenantName ?? ''}
        collapsed={sidebar.collapsed}
        onToggleCollapsed={sidebar.toggleCollapsed}
        mobileOpen={sidebar.mobileOpen}
        onCloseMobile={sidebar.closeMobile}
        onLogout={() => void handleLogout()}
        loggingOut={loggingOut}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        {/* Abaixo de md: topbar fino só com o hambúrguer — a sidebar vira overlay (sidebar.tsx). */}
        <div className="flex items-center gap-3 border-b border-border bg-bg-card px-4 py-3 md:hidden">
          <button
            type="button"
            onClick={sidebar.openMobile}
            aria-label="Abrir menu"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] text-text-muted hover:bg-bg hover:text-text"
          >
            <Menu className="h-5 w-5" aria-hidden="true" />
          </button>
          <p className="truncate text-sm font-semibold text-text">{session?.tenantName || 'Molho'}</p>
        </div>
        {logoutError && (
          <p role="alert" className="border-b border-critical bg-bg-card px-4 py-2 text-sm text-critical">
            {logoutError}
          </p>
        )}
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </div>
  );
}
