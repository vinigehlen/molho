'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

const STORAGE_KEY = 'molho_cookie_consent_v1';
const ANALYTICS_ENABLED = Boolean(process.env.NEXT_PUBLIC_POSTHOG_KEY || process.env.NEXT_PUBLIC_GA_ID);
const CONSENT_EVENT = 'molho:analytics-consent';

export function CookieConsent() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!ANALYTICS_ENABLED) return;
    setVisible(window.localStorage.getItem(STORAGE_KEY) === null);
  }, []);

  function choose(value: 'accepted' | 'declined') {
    window.localStorage.setItem(STORAGE_KEY, value);
    window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: value }));
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <section
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-3xl rounded-lg border border-border bg-cream-card p-4 shadow-lg sm:flex sm:items-center sm:justify-between sm:gap-5"
      aria-label="Preferências de cookies"
    >
      <div className="max-w-xl">
        <h2 className="text-body-strong text-text">Cookies no ponto certo</h2>
        <p className="mt-1 text-body text-text-muted">
          Usamos cookies essenciais para o site funcionar. Com sua permissão, usamos analytics para entender o que
          melhora o cadastro dos restaurantes.
        </p>
        <Link className="mt-2 inline-block text-body-strong text-brand-strong underline-offset-4 hover:underline" href="/privacidade">
          Ver privacidade
        </Link>
      </div>
      <div className="mt-4 flex gap-2 sm:mt-0">
        <button
          type="button"
          className="h-11 rounded-md border-2 border-border-strong px-4 text-body-strong text-brand-strong"
          onClick={() => choose('declined')}
        >
          Recusar
        </button>
        <button type="button" className="h-11 rounded-md bg-brand px-4 text-body-strong text-on-brand" onClick={() => choose('accepted')}>
          Aceitar
        </button>
      </div>
    </section>
  );
}
