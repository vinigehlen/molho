'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { MoButton } from '@molho/ui';
import {
  cancelSubscription,
  fetchSubscription,
  SubscriptionAlreadyCanceledError,
  type SubscriptionResponse,
} from '../../../lib/subscription-api';

/** Épico 13d — cobrança MANUAL no piloto: sem "trocar cartão"/"ver fatura" aqui, o pagamento é combinado direto com o suporte Molho (PIX/boleto). Esta tela só mostra ONDE a assinatura está no ciclo e permite cancelar. */
const STATUS_LABEL: Record<SubscriptionResponse['status'], string> = {
  trial: 'Período de teste',
  active: 'Ativa',
  past_due: 'Pagamento atrasado',
  suspended: 'Suspensa',
  canceled: 'Cancelada',
};

const STATUS_DESCRIPTION: Record<SubscriptionResponse['status'], string> = {
  trial: 'Aproveite todos os recursos sem custo. Combine o pagamento com o suporte Molho antes do fim do teste.',
  active: 'Tudo certo — sua loja continua no ar normalmente.',
  past_due: 'O pagamento do período atual está pendente. Regularize com o suporte Molho pra não perder o acesso.',
  suspended: 'O acesso está bloqueado por falta de pagamento. Fale com o suporte Molho pra reativar.',
  canceled: 'Essa assinatura foi cancelada e não está mais ativa.',
};

function formatDate(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: 'long', year: 'numeric' });
}

export default function AssinaturaPage() {
  const [subscription, setSubscription] = useState<SubscriptionResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [canceling, setCanceling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchSubscription()
      .then((data) => {
        if (vivo) setSubscription(data);
      })
      .catch(() => {
        if (vivo) setError('Não deu pra carregar sua assinatura.');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function handleCancel() {
    // "Cancelamento em 2 cliques": o 1º é o botão abaixo, o 2º é confirmar
    // aqui — sem passo a mais, sem digitar motivo, sem e-mail de retenção.
    if (!window.confirm('Cancelar sua assinatura? Sua loja fica indisponível até você reativar com o suporte Molho.')) {
      return;
    }
    setError(null);
    setCanceling(true);
    try {
      setSubscription(await cancelSubscription());
    } catch (cause) {
      setError(
        cause instanceof SubscriptionAlreadyCanceledError
          ? cause.message
          : 'Não deu pra cancelar agora. Tenta de novo.',
      );
    } finally {
      setCanceling(false);
    }
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-title-lg text-text">Assinatura</h1>
        <p className="text-body text-text-muted">Cobrança combinada direto com o suporte Molho — PIX ou boleto, sem cartão.</p>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <p className="text-body text-text-muted">Carregando…</p>
      ) : subscription ? (
        <div className="flex max-w-md flex-col gap-4 rounded-lg border border-border bg-bg-card p-5">
          <div>
            <p className="text-title text-text">{STATUS_LABEL[subscription.status]}</p>
            <p className="mt-1 text-body text-text-muted">{STATUS_DESCRIPTION[subscription.status]}</p>
          </div>

          {subscription.status === 'trial' && subscription.trialEndsAt ? (
            <p className="text-caption text-text-muted">Teste acaba em {formatDate(subscription.trialEndsAt)}.</p>
          ) : null}
          {subscription.status === 'active' && subscription.currentPeriodEndsAt ? (
            <p className="text-caption text-text-muted">Período atual até {formatDate(subscription.currentPeriodEndsAt)}.</p>
          ) : null}
          {subscription.status === 'past_due' && subscription.pastDueAt ? (
            <p className="text-caption text-text-muted">Pendente desde {formatDate(subscription.pastDueAt)}.</p>
          ) : null}
          {subscription.status === 'canceled' && subscription.canceledAt ? (
            <p className="text-caption text-text-muted">Cancelada em {formatDate(subscription.canceledAt)}.</p>
          ) : null}

          {subscription.status !== 'canceled' ? (
            <MoButton variant="ghost" size="sm" className="w-fit text-critical-strong" onClick={() => void handleCancel()} loading={canceling}>
              Cancelar assinatura
            </MoButton>
          ) : null}
        </div>
      ) : null}
    </main>
  );
}
