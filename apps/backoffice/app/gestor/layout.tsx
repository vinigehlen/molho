'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getStaffSession, subscribeStaffSessionClear } from '../../lib/staff-session';
import { refreshStaffSession } from '../../lib/staff-auth';

export default function GestorLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(getStaffSession() !== null);
  const [offline, setOffline] = useState(false);

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
  return children;
}
