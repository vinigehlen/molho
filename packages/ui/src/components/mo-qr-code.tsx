'use client';

import * as React from 'react';
import QRCode from 'qrcode';
import { cn } from '../lib/cn';
import { MoSkeleton } from './mo-skeleton';

export interface MoQrCodeProps {
  /** Qualquer texto/URL — vira QR no cliente, nunca gerado no servidor (mesmo racional do PIX em `mo-pix-payment.tsx`). */
  value: string;
  size?: number;
  className?: string;
}

/**
 * QR genérico (não-PIX) — extraído de `MoPixPayment` pra reuso em qualquer
 * lugar que precise transformar um link em código (ex.: "Publicar minha
 * loja" do wizard de onboarding, Épico 13).
 */
export function MoQrCode({ value, size = 200, className }: MoQrCodeProps) {
  const [dataUrl, setDataUrl] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelado = false;
    setDataUrl(null);
    QRCode.toDataURL(value, { margin: 1, width: size })
      .then((url) => {
        if (!cancelado) setDataUrl(url);
      })
      .catch(() => {
        if (!cancelado) setDataUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [value, size]);

  if (!dataUrl) return <MoSkeleton className={className} width={size} height={size} rounded="lg" label="Gerando código QR" />;
  return <img src={dataUrl} alt="Código QR para acessar o link" width={size} height={size} className={cn('rounded-[14px]', className)} />;
}
