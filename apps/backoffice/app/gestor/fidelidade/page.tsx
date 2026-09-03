'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MoButton, MoInput } from '@molho/ui';
import { fetchLoyaltyConfig, updateLoyaltyConfig, type LoyaltyConfig } from '../../../lib/loyalty-config-api';

export default function FidelidadePage() {
  const [config, setConfig] = useState<LoyaltyConfig | null>(null);
  const [draft, setDraft] = useState('5');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let vivo = true;
    fetchLoyaltyConfig()
      .then((data) => {
        if (!vivo) return;
        setConfig(data);
        setDraft(String(data.cashbackPercent));
      })
      .catch(() => {
        if (vivo) setError('Não deu pra carregar a configuração de fidelidade.');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function handleSave() {
    if (!config) return;
    setError(null);
    setSaved(false);
    const percent = Number(draft);
    if (!Number.isInteger(percent) || percent < 1 || percent > 100) {
      return setError('Informe um percentual inteiro entre 1 e 100.');
    }
    setSaving(true);
    try {
      const updated = await updateLoyaltyConfig(config, percent);
      setConfig(updated);
      setSaved(true);
    } catch {
      setError('Não deu pra salvar. Confere se a configuração não mudou em outra aba.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-title-lg text-text">Fidelidade</h1>
        <p className="text-body text-text-muted">
          Cashback: uma % de cada pedido concluído vira saldo pro cliente usar no próximo.
        </p>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <p className="text-body text-text-muted">Carregando…</p>
      ) : (
        <div className="flex max-w-sm flex-col gap-4 rounded-lg border border-border bg-bg-card p-4">
          <MoInput
            label="Cashback (%)"
            inputMode="numeric"
            value={draft}
            onChange={(e) => {
              setDraft(e.currentTarget.value);
              setSaved(false);
            }}
            hint="Aplicado sobre o total pago em cada pedido concluído."
          />
          {saved ? <p className="text-caption font-semibold text-positive">Salvo!</p> : null}
          <MoButton onClick={() => void handleSave()} loading={saving}>
            Salvar
          </MoButton>
        </div>
      )}
    </main>
  );
}
