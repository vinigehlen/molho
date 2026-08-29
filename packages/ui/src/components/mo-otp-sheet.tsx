'use client';

import * as React from 'react';
import { isPlausiblePhoneDigits } from '../lib/masks';
import { MoButton } from './mo-button';
import { MoInput } from './mo-input';
import { MoSheet } from './mo-sheet';

export type MoOtpActionResult = { ok: true } | { ok: false; message: string };

export interface MoOtpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Canal de ENTREGA do código (Épico 9c) — vem do backend, que é fonte única
   * (`otpChannel` no payload de GET /v1/store/:slug), nunca de env do front.
   * O telefone é pedido nos DOIS canais: ele é a identidade do cliente, o
   * e-mail é só por onde o código chega no piloto.
   */
  channel?: 'sms' | 'email';
  /** Chamada ao enviar telefone (+ e-mail, no canal de e-mail) — passo 1. */
  onRequestCode: (phone: string, email?: string) => Promise<MoOtpActionResult>;
  /** Chamada ao enviar o código (passo 2). */
  onVerifyCode: (phone: string, code: string, email?: string) => Promise<MoOtpActionResult>;
  /** Código verificado com sucesso — quem chama decide o que fazer depois (fechar o sheet, seguir o fluxo). */
  onVerified: () => void;
  className?: string;
}

type Step = 'phone' | 'code';

/** Espelha o cooldown de 60s do `OtpService` (CLAUDE.md, seção Segurança) —
 * sem contador visível, "Reenviar código" parecia clicável e o cliente
 * (Riley-tipo) clicava várias vezes sem entender por que nada mudava. */
const REENVIO_COOLDOWN_SEGUNDOS = 60;

/**
 * MoOtpSheet — login por OTP do cliente final, único ponto do storefront que
 * pede telefone (CLAUDE.md regra 13: só no "Fazer pedido" final, nunca antes).
 *
 * Sem `@molho/contracts` (mesmo padrão de MoAddressSheet) — quem chama
 * decide como formatar/normalizar antes de mandar pro backend; aqui só valida
 * "tem 11 dígitos" (DDD + nono dígito + número, sempre celular — fixo nunca
 * recebe SMS) e, no canal de e-mail, a forma grosseira do e-mail: a mesma
 * checagem que libera o botão, sem round-trip só pra descobrir formato.
 */
export function MoOtpSheet({ open, ...props }: MoOtpSheetProps) {
  // Remonta a cada abertura: os campos voltam ao estado inicial pelos
  // inicializadores do useState, sem effect que "ajusta" state em cima de prop.
  if (!open) return null;
  return <MoOtpSheetInner {...props} />;
}

function MoOtpSheetInner({
  onOpenChange,
  channel = 'sms',
  onRequestCode,
  onVerifyCode,
  onVerified,
  className,
}: Omit<MoOtpSheetProps, 'open'>) {
  const [step, setStep] = React.useState<Step>('phone');
  const [phone, setPhone] = React.useState('');
  const [email, setEmail] = React.useState('');
  const [code, setCode] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [cooldown, setCooldown] = React.useState(0);

  // Conta 1 em 1s até zerar; recomeça toda vez que `cooldown` é setado de
  // novo pra 60 (envio inicial e cada reenvio).
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const porEmail = channel === 'email';
  // Sempre celular (DDD + nono dígito + 8 dígitos = 11) — fixo (10 dígitos)
  // nunca recebe SMS. Mesma exigência de parsePhoneNumber (@molho/contracts),
  // que rejeitaria um fixo de qualquer forma.
  const telefoneValido = isPlausiblePhoneDigits(phone);
  const emailValido = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const contatoValido = telefoneValido && (!porEmail || emailValido);
  const codigoValido = code.replace(/\D/g, '').length === 6;

  async function enviarTelefone() {
    if (!contatoValido || loading) return;
    setLoading(true);
    setError(null);
    const resultado = await onRequestCode(phone, porEmail ? email.trim() : undefined);
    setLoading(false);
    if (!resultado.ok) {
      setError(resultado.message);
      return;
    }
    setStep('code');
    setCooldown(REENVIO_COOLDOWN_SEGUNDOS);
  }

  async function enviarCodigo() {
    if (!codigoValido || loading) return;
    setLoading(true);
    setError(null);
    const resultado = await onVerifyCode(phone, code, porEmail ? email.trim() : undefined);
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
    if (cooldown > 0 || loading) return;
    setError(null);
    setLoading(true);
    const resultado = await onRequestCode(phone, porEmail ? email.trim() : undefined);
    setLoading(false);
    if (!resultado.ok) {
      setError(resultado.message);
      return;
    }
    setCooldown(REENVIO_COOLDOWN_SEGUNDOS);
  }

  return (
    <MoSheet
      open
      onOpenChange={onOpenChange}
      title={step === 'phone' ? (porEmail ? 'Confirma seus contatos' : 'Confirma seu telefone') : 'Digite o código'}
      description={
        step === 'phone'
          ? porEmail
            ? 'A gente manda um código pro seu e-mail pra confirmar seu pedido.'
            : 'A gente manda um código por SMS pra confirmar seu pedido.'
          : porEmail
            ? `Enviamos um código de 6 dígitos pro seu e-mail. Confere também o spam.`
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
              error={porEmail ? undefined : (error ?? undefined)}
            />
            {porEmail ? (
              <MoInput
                label="E-mail"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="voce@email.com"
                inputMode="email"
                autoComplete="email"
                error={error ?? undefined}
              />
            ) : null}
            <MoButton disabled={!contatoValido} loading={loading} onClick={enviarTelefone}>
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
              <button
                type="button"
                onClick={reenviarCodigo}
                disabled={cooldown > 0}
                className="text-brand-strong underline-offset-2 hover:underline disabled:text-text-muted disabled:no-underline"
              >
                {cooldown > 0 ? `Reenviar em ${cooldown}s` : 'Reenviar código'}
              </button>
            </div>
          </>
        )}
      </div>
    </MoSheet>
  );
}
