'use client';

import * as React from 'react';
import { MoButton } from './mo-button';
import { MoInput } from './mo-input';
import { MoSheet } from './mo-sheet';

export type MoOtpActionResult = { ok: true } | { ok: false; message: string };

export interface MoOtpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Chamada ao enviar o telefone (passo 1). Dispara o SMS via OTP do lojista/plataforma. */
  onRequestCode: (phone: string) => Promise<MoOtpActionResult>;
  /** Chamada ao enviar o código (passo 2). */
  onVerifyCode: (phone: string, code: string) => Promise<MoOtpActionResult>;
  /** Código verificado com sucesso — quem chama decide o que fazer depois (fechar o sheet, seguir o fluxo). */
  onVerified: () => void;
  className?: string;
}

type Step = 'phone' | 'code';

/**
 * MoOtpSheet — login por OTP do cliente final, único ponto do storefront que
 * pede telefone (CLAUDE.md regra 13: só no "Fazer pedido" final, nunca antes).
 *
 * Sem `@molho/contracts` (mesmo padrão de MoAddressSheet) — quem chama
 * decide como formatar/normalizar o telefone antes de mandar pro backend;
 * aqui só valida "tem dígitos suficientes pra ser um telefone BR" (10 ou 11
 * dígitos, DDD + número), a mesma checagem grosseira que já libera o botão.
 */
export function MoOtpSheet({ open, onOpenChange, onRequestCode, onVerifyCode, onVerified, className }: MoOtpSheetProps) {
  const [step, setStep] = React.useState<Step>('phone');
  const [phone, setPhone] = React.useState('');
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setStep('phone');
    setPhone('');
    setCode('');
    setError(null);
    setLoading(false);
  }, [open]);

  if (!open) return null;

  const digitos = phone.replace(/\D/g, '');
  const telefoneValido = digitos.length === 10 || digitos.length === 11;
  const codigoValido = code.replace(/\D/g, '').length === 6;

  async function enviarTelefone() {
    if (!telefoneValido || loading) return;
    setLoading(true);
    setError(null);
    const resultado = await onRequestCode(phone);
    setLoading(false);
    if (!resultado.ok) {
      setError(resultado.message);
      return;
    }
    setStep('code');
  }

  async function enviarCodigo() {
    if (!codigoValido || loading) return;
    setLoading(true);
    setError(null);
    const resultado = await onVerifyCode(phone, code);
    setLoading(false);
    if (!resultado.ok) {
      setError(resultado.message);
      return;
    }
    onVerified();
  }

  function trocarNumero() {
    setStep('phone');
    setCode('');
    setError(null);
  }

  async function reenviarCodigo() {
    setError(null);
    setLoading(true);
    const resultado = await onRequestCode(phone);
    setLoading(false);
    if (!resultado.ok) setError(resultado.message);
  }

  return (
    <MoSheet
      open={open}
      onOpenChange={onOpenChange}
      title={step === 'phone' ? 'Confirma seu telefone' : 'Digite o código'}
      description={
        step === 'phone'
          ? 'A gente manda um código por SMS pra confirmar seu pedido.'
          : `Enviamos um código de 6 dígitos por SMS pro ${phone}.`
      }
      className={className}
    >
      <div className="flex flex-col gap-4 pb-6">
        {step === 'phone' ? (
          <>
            <MoInput
              label="Telefone"
              mask="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(51) 99999-9999"
              inputMode="tel"
              autoFocus
              error={error ?? undefined}
            />
            <MoButton disabled={!telefoneValido} loading={loading} onClick={enviarTelefone}>
              Enviar código
            </MoButton>
          </>
        ) : (
          <>
            <MoInput
              label="Código"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              placeholder="000000"
              inputMode="numeric"
              autoFocus
              error={error ?? undefined}
            />
            <MoButton disabled={!codigoValido} loading={loading} onClick={enviarCodigo}>
              Confirmar código
            </MoButton>
            <div className="flex items-center justify-between text-caption">
              <button type="button" onClick={trocarNumero} className="text-brand-strong underline-offset-2 hover:underline">
                Trocar número
              </button>
              <button type="button" onClick={reenviarCodigo} className="text-brand-strong underline-offset-2 hover:underline">
                Reenviar código
              </button>
            </div>
          </>
        )}
      </div>
    </MoSheet>
  );
}
