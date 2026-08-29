'use client';

import { useEffect, useState } from 'react';
import type { AdminOrder } from '@molho/contracts';
import { MoButton, MoSheet } from '@molho/ui';
import { fetchCustomerPhone } from '../../lib/orders-api';
import { waMeUrl, whatsappMessage } from '../../lib/whatsapp';

/**
 * Sheet do click-to-chat (Épico 11). O texto nasce pronto pelo status e é
 * EDITÁVEL — o lojista conhece o cliente, o Molho não. Tocar em "Abrir
 * WhatsApp" só abre o `wa.me`; quem aperta enviar é ele, no app dele.
 *
 * Nada é persistido: não existe "avisado" no pedido, nem `notification_log`
 * (Épico 12 decide se histórico vale a pena). Cola manual é cola manual.
 */
export function WhatsAppSheet({ order, onClose }: { order: AdminOrder; onClose: () => void }) {
  const [texto, setTexto] = useState(() => whatsappMessage(order) ?? '');
  const [phone, setPhone] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // O telefone só chega aqui, no clique — o board nunca carregou PII.
  useEffect(() => {
    let vivo = true;
    fetchCustomerPhone(order.id)
      .then((encontrado) => {
        if (!vivo) return;
        if (encontrado) setPhone(encontrado);
        else setErro('Não deu pra avisar por aqui. Chama o cliente pelo seu WhatsApp mesmo.');
      })
      .catch(() => {
        if (vivo) setErro('Não deu pra buscar o telefone. Tenta de novo.');
      });
    return () => {
      vivo = false;
    };
  }, [order.id]);

  function abrir() {
    if (!phone) return;
    // `window.open` dentro do handler de clique não é barrado por popup blocker.
    window.open(waMeUrl(phone, texto), '_blank', 'noopener,noreferrer');
    onClose();
  }

  return (
    <MoSheet
      open
      onOpenChange={(aberto) => !aberto && onClose()}
      title="Avisar cliente"
      description={order.customerName}
      footer={
        <MoButton fullWidth onClick={abrir} disabled={!phone || texto.trim() === ''}>
          {phone ? 'Abrir WhatsApp' : 'Buscando telefone…'}
        </MoButton>
      }
    >
      {/* Telefone auto-declarado (pedido guest, Épico 9c): pode ter dígito
          errado, e o lojista precisa saber ANTES de contar com o aviso. */}
      {!order.customerVerified && (
        <p className="mb-3 rounded-[14px] bg-caution/15 p-3 text-caption text-text">
          Telefone informado pelo cliente, não verificado.
        </p>
      )}

      {erro ? (
        <p className="text-caption text-critical">{erro}</p>
      ) : (
        <label className="flex flex-col gap-2">
          <span className="text-caption text-text-muted">Dá uma olhada antes de mandar, pode editar.</span>
          <textarea
            className="min-h-32 w-full rounded-[14px] border border-border bg-bg p-3 text-body text-text focus-visible:outline-none focus-visible:shadow-focus"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
          />
        </label>
      )}
    </MoSheet>
  );
}
