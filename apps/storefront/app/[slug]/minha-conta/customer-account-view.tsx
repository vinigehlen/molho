'use client';

import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft, MapPin, Pencil, Plus, Star, Trash2 } from 'lucide-react';
import type {
  CustomerOrderSummary,
  CustomerProfile,
  CustomerProfileAddress,
  LoyaltyEvent,
} from '@molho/contracts';
import {
  buttonVariants,
  cn,
  formatCents,
  formatCentsDelta,
  MoAddressSheet,
  MoButton,
  MoCard,
  MoCardContent,
  MoInput,
  MoSkeleton,
} from '@molho/ui';
import {
  createCustomerAddress,
  createReview,
  CustomerProfileConflictError,
  CustomerProfileUnauthorizedError,
  deleteCustomerAddress,
  getCustomerProfile,
  getLoyaltyBalance,
  getLoyaltyEvents,
  listCustomerAddresses,
  listCustomerOrders,
  ReviewAlreadyExistsError,
  updateCustomerAddress,
  updateCustomerProfile,
} from '../../../lib/customer-profile-api';
import { useCustomerToken } from '../../../lib/use-customer-token';
import { lookupPostalCode } from '../../../lib/viacep';

const STATUS: Record<CustomerOrderSummary['status'], string> = {
  pending_payment: 'Aguardando pagamento',
  received: 'Recebido',
  preparing: 'Em preparo',
  ready: 'Pronto',
  in_transit: 'Saiu pra entrega',
  completed: 'Concluído',
  expired: 'Expirado',
  auto_canceled: 'Cancelado',
  canceled: 'Cancelado',
  delivery_failed: 'Entrega não concluída',
};

export function CustomerAccountView({ slug, storeName }: { slug: string; storeName: string }) {
  const session = useCustomerToken(slug);
  const [mounted, setMounted] = React.useState(false);
  const [profile, setProfile] = React.useState<CustomerProfile | null>(null);
  const [addresses, setAddresses] = React.useState<CustomerProfileAddress[]>([]);
  const [orders, setOrders] = React.useState<CustomerOrderSummary[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [name, setName] = React.useState('');
  const [editingAddress, setEditingAddress] = React.useState<
    CustomerProfileAddress | null | undefined
  >(undefined);
  const [reviewingOrderId, setReviewingOrderId] = React.useState<string | null>(null);
  const [reviewedOrderIds, setReviewedOrderIds] = React.useState<Set<string>>(new Set());
  const [loyaltyBalanceCents, setLoyaltyBalanceCents] = React.useState(0);
  const [loyaltyEvents, setLoyaltyEvents] = React.useState<LoyaltyEvent[]>([]);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    if (!mounted) return;
    if (!session.token) {
      setLoading(false);
      return;
    }
    let active = true;
    Promise.all([
      getCustomerProfile(slug, session.token),
      listCustomerAddresses(slug, session.token),
      listCustomerOrders(slug, session.token),
    ])
      .then(([nextProfile, nextAddresses, nextOrders]) => {
        if (!active) return;
        setProfile(nextProfile);
        setName(nextProfile.name);
        setAddresses(nextAddresses);
        setOrders(nextOrders);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof CustomerProfileUnauthorizedError) session.clearToken();
        setError(cause instanceof Error ? cause.message : 'Não deu pra carregar sua conta agora.');
        setLoading(false);
      });
    // Separado do Promise.all acima de propósito: saldo é um bônus, não pode
    // derrubar perfil/endereços/pedidos se o módulo estiver desligado nesse
    // tenant (403) — falha calada, mostra 0.
    getLoyaltyBalance(slug, session.token)
      .then((cents) => {
        if (active) setLoyaltyBalanceCents(cents);
      })
      .catch(() => {});
    getLoyaltyEvents(slug, session.token)
      .then((events) => {
        if (active) setLoyaltyEvents(events);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [mounted, session.token, slug]);

  async function saveName() {
    if (!session.token || !profile) return;
    setError(null);
    try {
      const updated = await updateCustomerProfile(slug, session.token, {
        name,
        version: profile.version,
      });
      setProfile(updated);
      setName(updated.name);
    } catch (cause) {
      handleMutationError(cause);
    }
  }

  async function saveAddress(value: Parameters<typeof createCustomerAddress>[2]) {
    if (!session.token) return;
    setError(null);
    try {
      if (editingAddress) {
        const updated = await updateCustomerAddress(slug, session.token, editingAddress.id, {
          ...value,
          version: editingAddress.version,
        });
        setAddresses((current) => current.map((item) => (item.id === updated.id ? updated : item)));
      } else {
        const created = await createCustomerAddress(slug, session.token, value);
        setAddresses((current) => [created, ...current]);
      }
      setEditingAddress(undefined);
    } catch (cause) {
      handleMutationError(cause);
    }
  }

  async function removeAddress(address: CustomerProfileAddress) {
    if (!session.token) return;
    setError(null);
    try {
      await deleteCustomerAddress(slug, session.token, address.id, address.version);
      setAddresses((current) => current.filter((item) => item.id !== address.id));
    } catch (cause) {
      handleMutationError(cause);
    }
  }

  async function submitReview(orderId: string, rating: number, comment: string) {
    if (!session.token) return;
    setError(null);
    try {
      await createReview(slug, session.token, orderId, { rating, ...(comment.trim() ? { comment: comment.trim() } : {}) });
      setReviewedOrderIds((current) => new Set(current).add(orderId));
      setReviewingOrderId(null);
    } catch (cause) {
      // "já avaliado" não é erro de sessão/dados — só fecha o formulário,
      // sem mandar pro handler genérico (que mostraria "recarregue a página").
      if (cause instanceof ReviewAlreadyExistsError) {
        setReviewedOrderIds((current) => new Set(current).add(orderId));
        setReviewingOrderId(null);
        return;
      }
      handleMutationError(cause);
    }
  }

  function handleMutationError(cause: unknown) {
    if (cause instanceof CustomerProfileUnauthorizedError) session.clearToken();
    setError(
      cause instanceof CustomerProfileConflictError
        ? `${cause.message} Recarregue a página.`
        : cause instanceof Error
          ? cause.message
          : 'Não deu pra salvar agora.',
    );
  }

  if (!mounted || loading)
    return (
      <AccountShell slug={slug} storeName={storeName}>
        <MoSkeleton className="h-48 w-full" />
      </AccountShell>
    );
  if (!session.token || !profile)
    return (
      <AccountShell slug={slug} storeName={storeName}>
        <MoCard>
          <MoCardContent className="flex flex-col gap-4 p-5">
            <h2 className="text-title text-text">Sua conta está protegida</h2>
            <p className="text-body text-text-muted">
              {error ?? 'Confirme seu telefone ao finalizar um pedido para acessar seus dados.'}
            </p>
            <Link className={cn(buttonVariants({ fullWidth: true }))} href={`/${slug}`}>
              Voltar pro cardápio
            </Link>
          </MoCardContent>
        </MoCard>
      </AccountShell>
    );

  return (
    <AccountShell slug={slug} storeName={storeName}>
      {error ? (
        <p role="alert" className="rounded-md bg-critical/10 p-3 text-body text-critical-strong">
          {error}
        </p>
      ) : null}
      <section className="flex flex-col gap-3">
        <h2 className="text-title text-text">Seus dados</h2>
        <MoCard>
          <MoCardContent className="flex flex-col gap-4 p-5">
            <MoInput label="Nome" value={name} onChange={(event) => setName(event.target.value)} />
            <p className="text-caption text-text-muted">Telefone: {profile.phoneMasked}</p>
            {profile.emailMasked ? (
              <p className="text-caption text-text-muted">E-mail: {profile.emailMasked}</p>
            ) : null}
            <MoButton
              disabled={name.trim().length < 2 || name.trim() === profile.name}
              onClick={() => void saveName()}
            >
              Salvar nome
            </MoButton>
          </MoCardContent>
        </MoCard>
      </section>

      {loyaltyBalanceCents > 0 || loyaltyEvents.length > 0 ? (
        <section className="flex flex-col gap-3">
          <h2 className="text-title text-text">Seu cashback</h2>
          <MoCard>
            <MoCardContent className="flex flex-col gap-4 p-5">
              <div>
                <p className="text-title-lg tnum text-brand-strong">{formatCents(loyaltyBalanceCents)}</p>
                <p className="text-caption text-text-muted">Aplica no próximo pedido, na tela de revisão.</p>
              </div>
              {loyaltyEvents.length > 0 ? (
                <ul className="flex flex-col gap-2 border-t border-border pt-4">
                  {loyaltyEvents.map((event, index) => (
                    <li key={`${event.orderId}-${event.type}-${index}`} className="flex items-center justify-between gap-2 text-caption">
                      <span className="text-text-muted">
                        {event.type === 'earn' ? 'Ganhou' : 'Usou'} no pedido de{' '}
                        {new Date(event.createdAt).toLocaleDateString('pt-BR')}
                      </span>
                      <span className={cn('tnum font-semibold', event.type === 'earn' ? 'text-positive' : 'text-text')}>
                        {formatCentsDelta(event.type === 'earn' ? event.amountCents : -event.amountCents)}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </MoCardContent>
          </MoCard>
        </section>
      ) : null}

      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <h2 className="text-title text-text">Endereços</h2>
          <MoButton variant="secondary" size="sm" onClick={() => setEditingAddress(null)}>
            <Plus className="h-4 w-4" /> Novo
          </MoButton>
        </div>
        {addresses.length === 0 ? (
          <p className="text-body text-text-muted">Nenhum endereço salvo ainda.</p>
        ) : (
          addresses.map((address) => (
            <MoCard key={address.id}>
              <MoCardContent className="flex items-start gap-3 p-4">
                <MapPin className="mt-1 h-5 w-5 text-brand-strong" />
                <div className="min-w-0 flex-1">
                  <p className="text-body-strong text-text">{address.label}</p>
                  <p className="text-body text-text-muted">
                    {address.street}, {address.number ?? 's/n'}, {address.neighborhood}
                  </p>
                  <p className="text-caption text-text-muted">
                    {address.city}/{address.state}
                  </p>
                </div>
                <button
                  aria-label={`Editar ${address.label}`}
                  onClick={() => setEditingAddress(address)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-brand-strong"
                >
                  <Pencil className="h-4 w-4" />
                </button>
                <button
                  aria-label={`Excluir ${address.label}`}
                  onClick={() => void removeAddress(address)}
                  className="flex h-11 w-11 shrink-0 items-center justify-center text-critical-strong"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </MoCardContent>
            </MoCard>
          ))
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-title text-text">Pedidos recentes</h2>
        {orders.length === 0 ? (
          <p className="text-body text-text-muted">
            Seu histórico aparece aqui depois do primeiro pedido.
          </p>
        ) : (
          orders.map((order) => (
            <MoCard key={order.id}>
              <MoCardContent className="p-4">
                <div className="flex justify-between gap-3">
                  <div>
                    <p className="text-body-strong text-text">{STATUS[order.status]}</p>
                    <p className="text-caption text-text-muted">
                      {new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium' }).format(
                        new Date(order.createdAt),
                      )}
                    </p>
                  </div>
                  <p className="text-body-strong tabular-nums text-text">
                    {formatCents(order.totalCents)}
                  </p>
                </div>
                <p className="mt-2 text-caption text-text-muted">
                  {order.items.map((item) => `${item.quantity}× ${item.name}`).join(' · ')}
                </p>
                {/* D1: só pedido completed pode ser avaliado, e só uma vez —
                    `reviewedOrderIds` é otimista (sem readback do backend),
                    mas o servidor sempre revalida (409 se já existir). */}
                {order.status === 'completed' && !reviewedOrderIds.has(order.id) ? (
                  reviewingOrderId === order.id ? (
                    <OrderReviewForm
                      onCancel={() => setReviewingOrderId(null)}
                      onSubmit={(rating, comment) => void submitReview(order.id, rating, comment)}
                    />
                  ) : (
                    <MoButton variant="ghost" size="sm" className="mt-2" onClick={() => setReviewingOrderId(order.id)}>
                      Avaliar pedido
                    </MoButton>
                  )
                ) : order.status === 'completed' ? (
                  <p className="mt-2 text-caption text-text-muted">Obrigado pela avaliação!</p>
                ) : null}
              </MoCardContent>
            </MoCard>
          ))
        )}
      </section>

      <MoAddressSheet
        open={editingAddress !== undefined}
        onOpenChange={(open) => {
          if (!open) setEditingAddress(undefined);
        }}
        initialValue={editingAddress ?? null}
        onLookupPostalCode={lookupPostalCode}
        onSave={(value) => void saveAddress(value)}
      />
    </AccountShell>
  );
}

function AccountShell({
  slug,
  storeName,
  children,
}: {
  slug: string;
  storeName: string;
  children: React.ReactNode;
}) {
  return (
    <main className="mx-auto min-h-screen max-w-2xl bg-bg px-4 pb-12">
      <header className="-mx-4 mb-6 flex items-center gap-3 bg-brand px-4 py-5 text-on-brand">
        <Link
          href={`/${slug}`}
          aria-label="Voltar pro cardápio"
          className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <p className="text-caption opacity-90">{storeName}</p>
          <h1 className="text-title-lg">Minha conta</h1>
        </div>
      </header>
      <div className="flex flex-col gap-8">{children}</div>
    </main>
  );
}

/** Nota 1-5 + comentário opcional (D1: imutável, sem editar depois de enviar). */
function OrderReviewForm({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (rating: number, comment: string) => void;
}) {
  const [rating, setRating] = React.useState(0);
  const [comment, setComment] = React.useState('');

  return (
    <div className="mt-3 flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex gap-1" role="radiogroup" aria-label="Nota do pedido">
        {[1, 2, 3, 4, 5].map((value) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={rating === value}
            aria-label={`${value} estrela${value > 1 ? 's' : ''}`}
            onClick={() => setRating(value)}
            className="-m-1 p-1"
          >
            <Star
              className={cn('h-6 w-6', value <= rating ? 'fill-brand text-brand' : 'text-border-strong')}
              aria-hidden="true"
            />
          </button>
        ))}
      </div>
      <MoInput
        label="Comentário (opcional)"
        value={comment}
        onChange={(e) => setComment(e.currentTarget.value)}
      />
      <div className="flex gap-2">
        <MoButton size="sm" disabled={rating === 0} onClick={() => onSubmit(rating, comment)}>
          Enviar avaliação
        </MoButton>
        <MoButton variant="ghost" size="sm" onClick={onCancel}>
          Cancelar
        </MoButton>
      </div>
    </div>
  );
}
