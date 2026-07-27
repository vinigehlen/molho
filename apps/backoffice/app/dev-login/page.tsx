'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Login SÓ-DEV do backoffice (débito docs/07, sai com o Épico 9b). Dirige o OTP
 * REAL do Épico 3: pede o código (o MockMessagingProvider LOGA no console da
 * API), você digita, e a sessão de staff é gravada com o JWT real.
 *
 * `dev-only-auth` é importado DINAMICAMENTE atrás de `NODE_ENV === 'development'`
 * — `NODE_ENV` é substituído estático no build, então o branch vira código morto
 * em produção e o webpack ELIMINA o módulo do bundle (o caminho que obtém OTP
 * nem existe em prod, não só falha em runtime). A página em si early-returna em
 * prod.
 */
const DEV_SEED_PHONE = '+5551999990000'; // owner do seed (hardcoded pra não importar o módulo dev-only no topo)

export default function DevLoginPage() {
  const router = useRouter();
  const [phone, setPhone] = useState(DEV_SEED_PHONE);
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (process.env.NODE_ENV !== 'development') return null;

  // O `if (NODE_ENV !== 'development') return` NO INÍCIO de cada handler é o que
  // faz o webpack ELIMINAR o import dinâmico: NODE_ENV é estático no build, o
  // return vira incondicional em prod, e todo o resto (incluindo o import) vira
  // código morto removido. Guard só no topo do componente NÃO basta (o import
  // ficaria alcançável e seria empacotado).
  async function pedirCodigo() {
    if (process.env.NODE_ENV !== 'development') return;
    setBusy(true);
    setError(null);
    try {
      const { devRequestOtp } = await import('../../lib/dev-only-auth');
      await devRequestOtp(phone);
      setStep('code');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Falha ao pedir o código.');
    } finally {
      setBusy(false);
    }
  }

  async function entrar() {
    if (process.env.NODE_ENV !== 'development') return;
    setBusy(true);
    setError(null);
    try {
      const { devVerifyOtp } = await import('../../lib/dev-only-auth');
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
      <div className="w-full max-w-sm rounded-[20px] border border-border bg-bg-card p-6">
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
              className="w-full rounded-[14px] bg-brand px-3 py-2 font-medium text-on-brand disabled:opacity-50"
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
              className="w-full rounded-[14px] bg-brand px-3 py-2 font-medium text-on-brand disabled:opacity-50"
              onClick={() => void entrar()}
              disabled={busy}
            >
              {busy ? 'Entrando...' : 'Entrar'}
            </button>
          </div>
        )}

        {error && <p className="mt-3 text-sm text-critical">{error}</p>}
      </div>
    </main>
  );
}
