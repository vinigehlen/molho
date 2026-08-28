'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { slugifyStoreName } from '@molho/contracts';
import { activateStaffSession } from '../../lib/staff-auth';
import { checkSlugAvailability, requestSignupOtp, verifySignup, type SlugAvailability } from '../../lib/signup-api';

const SLUG_CHECK_DEBOUNCE_MS = 400;

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'details'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [slugAvailability, setSlugAvailability] = useState<SlugAvailability | null>(null);
  const [checkingSlug, setCheckingSlug] = useState(false);

  const slug = slugifyStoreName(restaurantName);
  // Sem isso, cada tecla digitada dispararia uma checagem de disponibilidade
  // contra o backend — 400ms de silêncio depois da última tecla é o que
  // separa "usuário ainda digitando" de "usuário parou, checa agora".
  useEffect(() => {
    if (!slug) {
      setSlugAvailability(null);
      setCheckingSlug(false);
      return;
    }
    setCheckingSlug(true);
    const timer = setTimeout(() => {
      checkSlugAvailability(slug)
        .then(setSlugAvailability)
        .finally(() => setCheckingSlug(false));
    }, SLUG_CHECK_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [slug]);
  const emailErrorId = 'signup-email-error';
  const detailsErrorId = 'signup-details-error';
  const emailHasError = step === 'email' && error !== null;
  const detailsHasError = step === 'details' && error !== null;

  async function sendCode() {
    if (!email.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await requestSignupOtp(email.trim());
      setStep('details');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o código.');
    } finally {
      setBusy(false);
    }
  }

  async function createStore() {
    // `!slug` (não `!restaurantName.trim()`): um nome só de símbolos/emoji
    // passa no trim() mas normaliza pra string vazia — sem isso o backend
    // recebia um `restaurantName` "válido" que não vira URL nenhuma.
    if (code.length !== 6 || !slug || !ownerName.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifySignup({
        email: email.trim(),
        code,
        restaurantName: restaurantName.trim(),
        ownerName: ownerName.trim(),
      });
      activateStaffSession(result.accessToken, {
        id: result.tenant.id,
        name: result.tenant.name,
        slug: result.tenant.slug,
        stores: [result.store],
      });
      router.replace('/gestor/configuracao');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível criar sua loja.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <section className="w-full max-w-lg rounded-[20px] border border-border bg-bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold text-brand-strong">Molho</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Crie seu restaurante grátis</h1>
        <p className="mt-2 text-sm text-text-muted">Teste por 7 dias, sem cartão. Primeiro a gente confirma seu e-mail.</p>

        {step === 'email' && (
          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void sendCode(); }}>
            <label className="block text-sm font-medium text-text" htmlFor="email">E-mail</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              aria-invalid={emailHasError}
              aria-describedby={emailHasError ? emailErrorId : undefined}
              className="w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-text outline-none focus:border-brand"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              required
            />
            <button className="w-full rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy || !email.trim()}>
              {busy ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        )}

        {step === 'details' && (
          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void createStore(); }}>
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="code">Código de e-mail</label>
              <input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{6}"
                maxLength={6}
                aria-invalid={detailsHasError}
                aria-describedby={detailsHasError ? detailsErrorId : undefined}
                className="mt-2 w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-center text-2xl tracking-[0.35em] text-text outline-none focus:border-brand"
                value={code}
                onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
                disabled={busy}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="ownerName">Seu nome</label>
              <input
                id="ownerName"
                className="mt-2 w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-text outline-none focus:border-brand"
                value={ownerName}
                onChange={(event) => setOwnerName(event.target.value)}
                disabled={busy}
                required
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-text" htmlFor="restaurantName">Nome do restaurante</label>
              <input
                id="restaurantName"
                className="mt-2 w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-text outline-none focus:border-brand"
                value={restaurantName}
                onChange={(event) => setRestaurantName(event.target.value)}
                disabled={busy}
                required
              />
              <SlugPreview slug={slug} checking={checkingSlug} availability={slugAvailability} />
            </div>
            <button className="w-full rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy || code.length !== 6 || !ownerName.trim() || !slug}>
              {busy ? 'Criando…' : 'Criar minha loja'}
            </button>
            <button type="button" className="w-full text-sm font-medium text-brand-strong" onClick={() => { setStep('email'); setCode(''); setError(null); }}>
              Usar outro e-mail
            </button>
          </form>
        )}

        {error && (
          <p
            id={step === 'email' ? emailErrorId : detailsErrorId}
            className="mt-4 rounded-[14px] bg-brand-faint p-3 text-sm text-critical"
            role="alert"
          >
            {error}
          </p>
        )}
      </section>
    </main>
  );
}

/**
 * Preview de `molho.live/<slug>` embaixo do nome (Bloco 2). Só reporta
 * "indisponível" depois que a checagem de verdade voltar do backend — nunca
 * assume ocupado enquanto ainda está checando, senão pisca âmbar a cada
 * tecla antes do debounce resolver.
 */
function SlugPreview({ slug, checking, availability }: { slug: string; checking: boolean; availability: SlugAvailability | null }) {
  if (!slug) return <p className="mt-2 text-xs text-text-muted">molho.live/<span className="italic">digite um nome</span></p>;

  if (checking || !availability) {
    return <p className="mt-2 text-xs text-text-muted">molho.live/{slug} · checando disponibilidade…</p>;
  }

  if (availability.available) {
    return (
      <p className="mt-2 text-xs font-medium text-positive">
        molho.live/{slug} · disponível
      </p>
    );
  }

  return (
    <p className="mt-2 text-xs font-medium text-brand-strong">
      molho.live/{slug} · indisponível{availability.suggestion ? ` — sugerimos ${availability.suggestion}` : ''}
    </p>
  );
}
