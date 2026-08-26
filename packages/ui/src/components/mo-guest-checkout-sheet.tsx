'use client';

import * as React from 'react';
import { isPlausiblePhoneDigits } from '../lib/masks';
import { MoButton } from './mo-button';
import { MoInput } from './mo-input';
import { MoSheet } from './mo-sheet';

export type MoGuestCheckoutResult = { ok: true } | { ok: false; message: string };

export interface MoGuestCheckoutSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Cria o pedido direto — não há passo 2 aqui, é esse o ponto do guest. */
  onSubmit: (name: string, phone: string) => Promise<MoGuestCheckoutResult>;
  className?: string;
}

/**
 * MoGuestCheckoutSheet — finalização SEM OTP, quando o lojista liga o módulo
 * `checkout.guest` (CLAUDE.md regra 13, EMENDA).
 *
 * Componente SEPARADO do `MoOtpSheet`, e não um modo dele, de propósito: os
 * dois pedem telefone, mas um PROVA a identidade em dois passos e o outro a
 * toma como declarada em um. Fundir os dois deixaria a diferença — que é a
 * decisão de segurança inteira — escondida atrás de uma prop booleana.
 *
 * O nome é obrigatório aqui e não existe no OTP: sem verificação, ele é a
 * única coisa que o lojista tem pra saber quem pediu (era o que o WhatsApp
 * já dava).
 *
 * Sem `@molho/contracts` (mesmo padrão do MoOtpSheet/MoAddressSheet): só a
 * validação grosseira que libera o botão. O telefone de verdade é validado
 * por `parsePhoneNumber` no servidor, que é quem manda.
 */
export function MoGuestCheckoutSheet({ open, onOpenChange, onSubmit, className }: MoGuestCheckoutSheetProps) {
  const [name, setName] = React.useState('');
  const [phone, setPhone] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setName('');
    setPhone('');
    setError(null);
    setLoading(false);
  }, [open]);

  if (!open) return null;

  // Celular (DDD + nono dígito + 8) — mesma exigência do MoOtpSheet e do
  // parsePhoneNumber: o lojista liga pra confirmar, e fixo não recebe torpedo.
  const telefoneValido = isPlausiblePhoneDigits(phone);
  const nomeValido = name.trim().length >= 2;
  const podeEnviar = telefoneValido && nomeValido;

  async function enviar() {
    if (!podeEnviar || loading) return;
    setLoading(true);
    setError(null);
    const resultado = await onSubmit(name.trim(), phone);
    setLoading(false);
    if (!resultado.ok) setError(resultado.message);
  }

  return (
    <MoSheet
      open={open}
      onOpenChange={onOpenChange}
      title="Quase lá"
      description="Só o nome e o telefone pra loja falar com você sobre a entrega."
      className={className}
    >
      <div className="flex flex-col gap-4 pb-6">
        <MoInput
          label="Nome"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Como a loja te chama"
          autoComplete="name"
          autoFocus
        />
        <MoInput
          label="Telefone"
          mask="phone"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="(51) 99999-9999"
          inputMode="tel"
          autoComplete="tel"
          error={error ?? undefined}
        />
        <MoButton disabled={!podeEnviar} loading={loading} onClick={enviar}>
          Fazer pedido
        </MoButton>
      </div>
    </MoSheet>
  );
}
