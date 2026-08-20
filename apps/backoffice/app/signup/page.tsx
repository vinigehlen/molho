'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { activateStaffSession } from '../../lib/staff-auth';
import { requestSignupOtp, verifySignup } from '../../lib/signup-api';

export default function SignupPage() {
  const router = useRouter();
  const [step, setStep] = useState<'email' | 'details'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [ownerName, setOwnerName] = useState('');
  const [restaurantName, setRestaurantName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
    if (code.length !== 6 || !restaurantName.trim() || !ownerName.trim()) return;
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
      router.replace('/gestor');
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
              className="w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-text outline-none focus:border-brand"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
              required
            />
            <button className="w-full rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy || !email.trim()}>
              {busy ? 'Enviando...' : 'Enviar código'}
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
            </div>
            <button className="w-full rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy || code.length !== 6 || !ownerName.trim() || !restaurantName.trim()}>
              {busy ? 'Criando...' : 'Criar minha loja'}
            </button>
            <button type="button" className="w-full text-sm font-medium text-brand-strong" onClick={() => { setStep('email'); setCode(''); setError(null); }}>
              Usar outro e-mail
            </button>
          </form>
        )}

        {error && <p className="mt-4 rounded-[14px] bg-brand-faint p-3 text-sm text-critical" role="alert">{error}</p>}
      </section>
    </main>
  );
}
