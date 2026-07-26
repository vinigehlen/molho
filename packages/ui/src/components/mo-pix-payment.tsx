'use client';

import { Check, Copy } from 'lucide-react';
import * as React from 'react';
import QRCode from 'qrcode';
import { cn } from '../lib/cn';
import { formatCents } from '../lib/format';
import { MoButton } from './mo-button';
import { MoCard, MoCardContent, MoCardHeader, MoCardTitle } from './mo-card';
import { MoSkeleton } from './mo-skeleton';

export interface MoPixPaymentProps {
  /** BR Code completo (`@molho/contracts/pix.ts`) — mesma string vira QR e copia-e-cola. */
  payload: string;
  totalCents: number;
  className?: string;
}

/**
 * PIX estático (Épico 8) — QR renderizado NO CLIENTE a partir do payload que
 * a API já monta pronto (nunca gera imagem no servidor; ver
 * `checkout-order.service.ts`). Variante de botão `pix` (mo-button.tsx) é a
 * cor oficial do Banco Central, não do tema do lojista — pagamento não é
 * branding.
 */
export function MoPixPayment({ payload, totalCents, className }: MoPixPaymentProps) {
  const [qrDataUrl, setQrDataUrl] = React.useState<string | null>(null);
  const [copiado, setCopiado] = React.useState(false);

  React.useEffect(() => {
    let cancelado = false;
    QRCode.toDataURL(payload, { margin: 1, width: 240 })
      .then((url) => {
        if (!cancelado) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelado) setQrDataUrl(null);
      });
    return () => {
      cancelado = true;
    };
  }, [payload]);

  async function copiarCodigo() {
    try {
      await navigator.clipboard.writeText(payload);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {
      // Sem clipboard API (contexto não-seguro, permissão negada) — o
      // código continua selecionável na tela, só o atalho de copiar falha.
    }
  }

  return (
    <MoCard className={cn('flex flex-col items-center gap-4 text-center', className)}>
      <MoCardHeader>
        <MoCardTitle>Pague com PIX pra confirmar</MoCardTitle>
      </MoCardHeader>
      <MoCardContent className="flex flex-col items-center gap-4">
        <p className="text-title-lg text-text">{formatCents(totalCents)}</p>

        {qrDataUrl ? (
          <img src={qrDataUrl} alt="QR Code para pagamento PIX" width={240} height={240} className="rounded-md" />
        ) : (
          <MoSkeleton width={240} height={240} rounded="md" label="Gerando QR Code do PIX" />
        )}

        <MoButton
          variant="pix"
          fullWidth
          icon={copiado ? <Check /> : <Copy />}
          onClick={() => void copiarCodigo()}
        >
          {copiado ? 'Código copiado!' : 'Copiar código PIX'}
        </MoButton>

        <p className="text-caption text-text-muted">
          Abre o app do seu banco, escolhe pagar com PIX (câmera ou copia e cola) e pronto — a loja confirma assim que
          o pagamento cair.
        </p>
      </MoCardContent>
    </MoCard>
  );
}
