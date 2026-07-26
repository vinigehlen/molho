'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { DEV_SEED_OWNER, devRequestOtp, devVerifyOtp } from '../../lib/dev-only-auth';

/**
 * Login SÓ-DEV do backoffice (débito docs/07, sai com o Épico 9b). Dirige o OTP
 * REAL do Épico 3: pede o código (o MockMessagingProvider LOGA no console da
 * API), você digita, e a sessão de staff é gravada com o JWT real. Depois
 * `arm → EventSource → StreamCookieAuthGuard` roda de verdade localmente.
 */
export default function DevLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState<string>(DEV_SEED_OWNER.phone);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function pedirCodigo() {
    setBusy(true);
    setError(null);
    try {
      await devRequestOtp(phone);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao pedir o código.');
    } finally {
      setBusy(false);
    }
  }

  async function entrar() {
    setBusy(true);
    setError(null);
    try {
      await devVerifyOtp(phone, code);
      router.push('/gestor');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Código inválido.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <div className="w-full max-w-sm rounded-[20px] border border-border bg-surface p-6">
        <h1 className="text-lg font-semibold text-text">Login de staff (dev)</h1>
        <p className="mt-1 text-sm text-text-muted">
          Atalho só-dev. O código sai no <strong>console da API</strong> (MockMessagingProvider).
        </p>

        {step === 'phone' ? (
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-text"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+55..."
              aria-label="Telefone"
            />
            <button
              className="w-full rounded-[14px] bg-primary px-3 py-2 font-medium text-primary-fg disabled:opacity-50"
              onClick={() => void pedirCodigo()}
              disabled={busy}
            >
              {busy ? 'Enviando...' : 'Enviar código'}
            </button>
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            <input
              className="w-full rounded-[14px] border border-border bg-bg px-3 py-2 text-text tabular-nums"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="Código do console"
              inputMode="numeric"
              aria-label="Código"
            />
            <button
              className="w-full rounded-[14px] bg-primary px-3 py-2 font-medium text-primary-fg disabled:opacity-50"
              onClick={() => void entrar()}
              disabled={busy}
            >
              {busy ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-danger">{error}</p>}
      </div>
    </main>
  );
}
