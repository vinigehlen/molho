'use client';

import React, { useEffect, useState } from 'react';
import { AlertTriangle, Star } from 'lucide-react';
import { MoButton, MoEmptyState, MoInput } from '@molho/ui';
import { fetchReviews, replyReview, type Review } from '../../../lib/reviews-api';

function Stars({ rating }: { rating: number }) {
  return (
    <div className="flex gap-0.5" aria-label={`${rating} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((value) => (
        <Star key={value} className={value <= rating ? 'h-4 w-4 fill-brand text-brand' : 'h-4 w-4 text-border-strong'} aria-hidden="true" />
      ))}
    </div>
  );
}

export default function AvaliacoesPage() {
  const [reviews, setReviews] = useState<Review[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [replyingId, setReplyingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let vivo = true;
    fetchReviews()
      .then((data) => {
        if (vivo) setReviews(data);
      })
      .catch(() => {
        if (vivo) setError('Não deu pra carregar as avaliações.');
      })
      .finally(() => {
        if (vivo) setLoading(false);
      });
    return () => {
      vivo = false;
    };
  }, []);

  async function handleReply(review: Review) {
    if (!draft.trim()) return;
    setBusyId(review.id);
    try {
      const updated = await replyReview(review, draft.trim());
      setReviews((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
      setReplyingId(null);
      setDraft('');
    } catch {
      setError('Não deu pra enviar a resposta. Tenta de novo.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="flex flex-col gap-6 p-6">
      <header>
        <h1 className="text-title-lg text-text">Avaliações</h1>
        <p className="text-body text-text-muted">O que os clientes acharam dos pedidos concluídos.</p>
      </header>

      {error ? (
        <div className="flex items-start gap-2 rounded-md bg-critical/10 p-4 text-body text-critical-strong">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : null}

      {loading ? (
        <p className="text-body text-text-muted">Carregando avaliações…</p>
      ) : reviews.length === 0 ? (
        <MoEmptyState title="Nenhuma avaliação ainda" description="Elas aparecem aqui assim que o cliente avaliar um pedido concluído." />
      ) : (
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-bg-card">
          {reviews.map((review) => (
            <div key={review.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-center justify-between gap-4">
                <Stars rating={review.rating} />
                <span className="text-caption text-text-muted">
                  {new Date(review.createdAt).toLocaleDateString('pt-BR')}
                </span>
              </div>
              {review.comment ? <p className="text-body text-text">{review.comment}</p> : null}

              {review.reply ? (
                <div className="rounded-md bg-bg p-3">
                  <p className="text-caption font-semibold text-text-muted">Sua resposta</p>
                  <p className="text-body text-text">{review.reply}</p>
                </div>
              ) : replyingId === review.id ? (
                <div className="flex flex-col gap-2">
                  <MoInput label="Responder" value={draft} onChange={(e) => setDraft(e.currentTarget.value)} />
                  <div className="flex gap-2">
                    <MoButton size="sm" loading={busyId === review.id} onClick={() => void handleReply(review)}>
                      Enviar resposta
                    </MoButton>
                    <MoButton variant="ghost" size="sm" onClick={() => { setReplyingId(null); setDraft(''); }}>
                      Cancelar
                    </MoButton>
                  </div>
                </div>
              ) : (
                <MoButton variant="secondary" size="sm" className="self-start" onClick={() => { setReplyingId(review.id); setDraft(''); }}>
                  Responder
                </MoButton>
              )}
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
