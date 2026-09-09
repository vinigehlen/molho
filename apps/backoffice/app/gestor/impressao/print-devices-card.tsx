'use client';

import React, { useCallback, useEffect, useState } from 'react';
import {
  fetchPrintDevices,
  pairPrintDevice,
  PrintingUnavailableError,
  revokePrintDevice,
  rotatePrintDevice,
  type PairedPrintDevice,
  type PrintDeviceSummary,
} from '../../../lib/printing-api';

/**
 * Pareamento do agente de impressão (NG-06). Parear → nome → segredo mostrado
 * UMA vez → o operador cola no instalador do agente. Revogar corta a
 * impressão daquele dispositivo na hora.
 */
export function PrintDevicesCard() {
  const [state, setState] = useState<{ status: 'loading' | 'ready' | 'unavailable' | 'error'; devices: PrintDeviceSummary[] }>({
    status: 'loading',
    devices: [],
  });
  const [freshSecret, setFreshSecret] = useState<PairedPrintDevice | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState('');

  const load = useCallback(async () => {
    try {
      setState({ status: 'ready', devices: await fetchPrintDevices() });
    } catch (err) {
      setState({ status: err instanceof PrintingUnavailableError ? 'unavailable' : 'error', devices: [] });
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não deu certo agora.');
    } finally {
      setBusy(false);
    }
  }

  if (state.status === 'unavailable') return null;

  return (
    <section className="rounded-[14px] border border-border bg-bg p-4">
      <h3 className="text-base font-semibold text-text">Dispositivos de impressão</h3>
      <p className="mt-2 text-sm leading-6 text-text-muted">
        Cada computador que imprime comanda tem uma credencial própria. Parear gera um código que você cola no agente uma
        vez. Revogar corta a impressão daquele computador imediatamente.
      </p>

      {freshSecret && (
        <div className="mt-3 rounded-[14px] border border-caution bg-brand-faint p-3">
          <p className="text-sm font-semibold text-brand-strong">
            Código do dispositivo “{freshSecret.device.name}” — copie agora, ele não aparece de novo.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="grow overflow-x-auto rounded bg-text px-2 py-1 text-xs text-bg">{freshSecret.secret}</code>
            <button
              type="button"
              className="shrink-0 rounded-full border border-border px-3 py-1 text-xs font-medium text-text"
              onClick={() => void navigator.clipboard.writeText(freshSecret.secret).catch(() => undefined)}
            >
              Copiar
            </button>
          </div>
          <button
            type="button"
            className="mt-2 text-xs text-text-muted underline"
            onClick={() => setFreshSecret(null)}
          >
            Já copiei, fechar
          </button>
        </div>
      )}

      <form
        className="mt-4 flex flex-wrap items-end gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          if (!name.trim()) return;
          void run(async () => {
            setFreshSecret(await pairPrintDevice(name.trim()));
            setName('');
          });
        }}
      >
        <label className="flex flex-col gap-1 text-xs text-text-muted">
          Nome do dispositivo
          <input
            className="rounded-[10px] border border-border bg-bg-card px-3 py-2 text-sm text-text"
            placeholder="Ex.: Cozinha"
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <button
          type="submit"
          disabled={busy || !name.trim()}
          className="rounded-full bg-brand px-4 py-2 text-sm font-semibold text-on-brand disabled:opacity-50"
        >
          Parear dispositivo
        </button>
      </form>

      {error && (
        <p className="mt-2 text-xs font-medium text-critical" aria-live="polite">
          {error}
        </p>
      )}

      <ul className="mt-4 divide-y divide-border">
        {state.status === 'loading' && <li className="py-3 text-sm text-text-muted">Carregando…</li>}
        {state.status === 'error' && <li className="py-3 text-sm text-critical">Não deu pra carregar os dispositivos.</li>}
        {state.status === 'ready' && state.devices.length === 0 && (
          <li className="py-3 text-sm text-text-muted">Nenhum dispositivo pareado ainda.</li>
        )}
        {state.devices.map((device) => (
          <li key={device.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
            <div>
              <p className="text-sm font-medium text-text">
                {device.name} <span className="font-normal text-text-muted">· molho_pd_{device.tokenPrefix}••••</span>
              </p>
              <p className="text-xs text-text-muted">
                {device.revokedAt
                  ? `revogado ${new Date(device.revokedAt).toLocaleString('pt-BR')}`
                  : device.lastSeenAt
                    ? `visto ${new Date(device.lastSeenAt).toLocaleString('pt-BR')}`
                    : 'nunca se conectou'}
              </p>
            </div>
            {!device.revokedAt && (
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-border px-3 py-1 text-xs font-medium text-text disabled:opacity-50"
                  onClick={() => void run(async () => setFreshSecret(await rotatePrintDevice(device.id)))}
                >
                  Gerar novo código
                </button>
                <button
                  type="button"
                  disabled={busy}
                  className="rounded-full border border-critical px-3 py-1 text-xs font-medium text-critical disabled:opacity-50"
                  onClick={() => void run(() => revokePrintDevice(device.id))}
                >
                  Revogar
                </button>
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
