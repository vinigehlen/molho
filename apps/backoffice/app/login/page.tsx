'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  activateStaffSession,
  fetchOtpChannel,
  requestStaffOtp,
  verifyStaffOtp,
  type StaffTenant,
} from '../../lib/staff-auth';
import { getStaffSession } from '../../lib/staff-session';

export default function LoginPage() {
  const router = useRouter();
  const [channel, setChannel] = useState<'email' | 'sms' | null>(null);
  const [identifier, setIdentifier] = useState('');
  const [code, setCode] = useState('');
  const [accessToken, setAccessToken] = useState('');
  const [tenants, setTenants] = useState<StaffTenant[]>([]);
  const [step, setStep] = useState<'identifier' | 'code' | 'tenant'>('identifier');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadChannel = useCallback(() => {
    setError(null);
    setChannel(null);
    void fetchOtpChannel()
      .then(setChannel)
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o login.');
      });
  }, []);

  useEffect(() => {
    if (getStaffSession()) {
      router.replace('/gestor');
      return;
    }
    loadChannel();
  }, [loadChannel, router]);

  async function requestCode() {
    if (!channel || !identifier.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await requestStaffOtp(channel, identifier.trim());
      setStep('code');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível enviar o código.');
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode() {
    if (!channel || code.length !== 6) return;
    setBusy(true);
    setError(null);
    try {
      const result = await verifyStaffOtp(channel, identifier.trim(), code);
      if (result.tenants.length === 0) throw new Error('Seu acesso ainda não está ligado a um restaurante.');
      if (result.tenants.length === 1 && result.tenants[0]) {
        enter(result.accessToken, result.tenants[0]);
        return;
      }
      setAccessToken(result.accessToken);
      setTenants(result.tenants);
      setStep('tenant');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Código inválido ou expirado.');
    } finally {
      setBusy(false);
    }
  }

  function enter(token: string, tenant: StaffTenant) {
    activateStaffSession(token, tenant);
    router.replace('/gestor');
  }

  const isEmail = channel === 'email';
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <section className="w-full max-w-md rounded-[20px] border border-border bg-bg-card p-6 shadow-sm">
        <p className="text-sm font-semibold text-brand-strong">Molho</p>
        <h1 className="mt-1 text-2xl font-semibold text-text">Entre no seu restaurante</h1>
        <p className="mt-2 text-sm text-text-muted">Sem senha: a gente envia um código de 6 dígitos.</p>

        {step === 'identifier' && channel && (
          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void requestCode(); }}>
            <label className="block text-sm font-medium text-text" htmlFor="identifier">
              {isEmail ? 'E-mail' : 'Celular'}
            </label>
            <input
              id="identifier"
              type={isEmail ? 'email' : 'tel'}
              autoComplete={isEmail ? 'email' : 'tel'}
              className="w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-text outline-none focus:border-brand"
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              disabled={!channel || busy}
              required
            />
            <button className="w-full rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={!channel || busy}>
              {busy ? 'Enviando…' : 'Enviar código'}
            </button>
          </form>
        )}

        {step === 'identifier' && !channel && !error && (
          <p className="mt-6 text-sm text-text-muted" role="status">Carregando login…</p>
        )}

        {step === 'identifier' && !channel && error && (
          <button
            type="button"
            className="mt-4 w-full rounded-[14px] border border-border px-4 py-3 font-semibold text-text"
            onClick={loadChannel}
          >
            Tentar novamente
          </button>
        )}

        {step === 'code' && (
          <form className="mt-6 space-y-4" onSubmit={(event) => { event.preventDefault(); void verifyCode(); }}>
            <label className="block text-sm font-medium text-text" htmlFor="code">Código de acesso</label>
            <input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              className="w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-center text-2xl tracking-[0.35em] text-text outline-none focus:border-brand"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={busy}
              autoFocus
            />
            <button className="w-full rounded-[14px] bg-brand px-4 py-3 font-semibold text-on-brand disabled:opacity-50" disabled={busy || code.length !== 6}>
              {busy ? 'Entrando…' : 'Entrar'}
            </button>
            <button type="button" className="w-full text-sm font-medium text-brand-strong" onClick={() => { setStep('identifier'); setCode(''); setError(null); }}>
              Usar outro {isEmail ? 'e-mail' : 'celular'}
            </button>
          </form>
        )}

        {step === 'tenant' && (
          <div className="mt-6 space-y-3">
            <p className="text-sm font-medium text-text">Qual restaurante você vai cuidar agora?</p>
            {tenants.map((tenant) => (
              <button key={tenant.id} className="w-full rounded-[14px] border border-border bg-bg px-4 py-3 text-left font-medium text-text hover:border-brand" onClick={() => enter(accessToken, tenant)}>
                {tenant.name}
              </button>
            ))}
          </div>
        )}

        {error && <p className="mt-4 rounded-[14px] bg-brand-faint p-3 text-sm text-critical" role="alert">{error}</p>}
      </section>
    </main>
  );
}
