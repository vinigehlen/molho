'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CounterOrderPaymentMethod, CounterOrderResponse } from '@molho/contracts';
import { Minus, Plus, ReceiptText, RefreshCw, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { createCounterOrder, fetchCounterCatalog, type CounterCategory, type CounterProduct } from '../../../lib/counter-pos-api';
import { centsToBRL } from '../../../lib/format';
import { fetchMyStores, type StaffStore } from '../../../lib/my-stores-api';

interface CartLine {
  product: CounterProduct;
  quantity: number;
}

const PAYMENT_LABEL: Record<CounterOrderPaymentMethod, string> = {
  pix: 'PIX',
  cash_at_counter: 'Dinheiro',
  card_at_counter: 'Cartão',
};

export default function BalcaoPage() {
  const [stores, setStores] = useState<StaffStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [categories, setCategories] = useState<CounterCategory[]>([]);
  const [products, setProducts] = useState<CounterProduct[]>([]);
  const [categoryId, setCategoryId] = useState('all');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<CounterOrderPaymentMethod>('pix');
  const [customerName, setCustomerName] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<CounterOrderResponse | null>(null);

  const filteredProducts = useMemo(
    () => products.filter((product) => categoryId === 'all' || product.categoryId === categoryId),
    [categoryId, products],
  );
  const totalCents = cart.reduce((sum, line) => sum + line.product.basePriceCents * line.quantity, 0);

  useEffect(() => {
    void loadInitialData();
  }, []);

  async function loadInitialData() {
    setLoading(true);
    setError(null);
    try {
      const [storeList, catalog] = await Promise.all([fetchMyStores(), fetchCounterCatalog()]);
      setStores(storeList);
      setStoreId(storeList[0]?.id ?? '');
      setCategories(catalog.categories);
      setProducts(catalog.products);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar balcão.');
    } finally {
      setLoading(false);
    }
  }

  function addProduct(product: CounterProduct) {
    setSuccess(null);
    setCart((current) => {
      const existing = current.find((line) => line.product.id === product.id);
      if (existing) return current.map((line) => (line.product.id === product.id ? { ...line, quantity: line.quantity + 1 } : line));
      return [...current, { product, quantity: 1 }];
    });
  }

  function updateQuantity(productId: string, delta: number) {
    setCart((current) =>
      current
        .map((line) => (line.product.id === productId ? { ...line, quantity: Math.max(0, line.quantity + delta) } : line))
        .filter((line) => line.quantity > 0),
    );
  }

  async function submitOrder() {
    if (!storeId || cart.length === 0) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await createCounterOrder({
        storeId,
        items: cart.map((line) => ({ productId: line.product.id, quantity: line.quantity })),
        paymentMethod,
        customerName,
        notes,
      });
      setSuccess(result);
      setCart([]);
      setCustomerName('');
      setNotes('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar pedido.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-bg p-4">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3 border-b border-border pb-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.12em] text-brand">
            <ReceiptText className="h-4 w-4" />
            Balcão
          </p>
          <h1 className="mt-2 text-2xl font-semibold text-text">PDV de balcão</h1>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link className="rounded-full border border-border px-3 py-1 text-sm font-medium text-text" href="/gestor">
            Pedidos
          </Link>
          <button
            className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 text-sm font-medium text-text disabled:opacity-50"
            onClick={() => void loadInitialData()}
            disabled={loading}
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      {error && (
        <div role="alert" className="mb-4 rounded-[14px] border border-critical/30 bg-critical/5 p-4 font-medium text-critical">
          {error}
        </div>
      )}
      {success && (
        <div role="status" className="mb-4 rounded-[14px] border border-positive/30 bg-positive/10 p-4 font-medium text-positive">
          Pedido {success.orderId.slice(0, 8)} criado: {centsToBRL(success.totalCents)}
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-[1fr_420px]">
        <section className="space-y-4">
          <div className="flex flex-wrap gap-3 rounded-[16px] border border-border bg-bg-card p-4">
            <label className="min-w-64 flex-1 text-sm font-medium text-text-muted">
              Loja
              <select
                className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-base font-semibold text-text"
                value={storeId}
                onChange={(event) => setStoreId(event.target.value)}
              >
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="min-w-64 flex-1 text-sm font-medium text-text-muted">
              Categoria
              <select
                className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-base font-semibold text-text"
                value={categoryId}
                onChange={(event) => setCategoryId(event.target.value)}
              >
                <option value="all">Todas</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.id}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {loading ? (
            <div className="rounded-[16px] border border-border bg-bg-card p-8 text-text-muted">Carregando produtos…</div>
          ) : filteredProducts.length === 0 ? (
            <div className="rounded-[16px] border border-border bg-bg-card p-8 text-text-muted">Nenhum produto disponível.</div>
          ) : (
            <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
              {filteredProducts.map((product) => (
                <button
                  key={product.id}
                  className="min-h-28 rounded-[16px] border border-border bg-bg-card p-4 text-left transition hover:border-brand hover:bg-brand-faint"
                  onClick={() => addProduct(product)}
                >
                  <span className="block text-base font-semibold text-text">{product.name}</span>
                  {product.description && <span className="mt-1 block text-sm text-text-muted">{product.description}</span>}
                  <span className="mt-3 block text-lg font-bold tabular-nums text-brand">{centsToBRL(product.basePriceCents)}</span>
                </button>
              ))}
            </div>
          )}
        </section>

        <aside className="rounded-[16px] border border-border bg-bg-card p-4">
          <h2 className="text-lg font-semibold text-text">Pedido</h2>
          <div className="mt-4 space-y-3">
            {cart.length === 0 ? (
              <p className="rounded-[12px] border border-dashed border-border p-4 text-sm text-text-muted">Adicione produtos para iniciar.</p>
            ) : (
              cart.map((line) => (
                <div key={line.product.id} className="rounded-[12px] border border-border bg-bg p-3">
                  <div className="flex justify-between gap-3">
                    <div>
                      <p className="font-semibold text-text">{line.product.name}</p>
                      <p className="text-sm tabular-nums text-text-muted">{centsToBRL(line.product.basePriceCents)}</p>
                    </div>
                    <p className="font-bold tabular-nums text-text">{centsToBRL(line.product.basePriceCents * line.quantity)}</p>
                  </div>
                  <div className="mt-3 flex items-center gap-2">
                    <button
                      aria-label={`Diminuir quantidade de ${line.product.name}`}
                      className="rounded-full border border-border p-2 text-text"
                      onClick={() => updateQuantity(line.product.id, -1)}
                    >
                      <Minus className="h-4 w-4" />
                    </button>
                    <span className="w-8 text-center font-semibold tabular-nums text-text">{line.quantity}</span>
                    <button
                      aria-label={`Aumentar quantidade de ${line.product.name}`}
                      className="rounded-full border border-border p-2 text-text"
                      onClick={() => updateQuantity(line.product.id, 1)}
                    >
                      <Plus className="h-4 w-4" />
                    </button>
                    <button
                      aria-label={`Remover ${line.product.name}`}
                      className="ml-auto rounded-full border border-border p-2 text-critical"
                      onClick={() => updateQuantity(line.product.id, -line.quantity)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <label className="mt-4 block text-sm font-medium text-text-muted">
            Cliente
            <input
              className="mt-1 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-text"
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              placeholder="Nome para chamar"
            />
          </label>

          <label className="mt-4 block text-sm font-medium text-text-muted">
            Observações
            <textarea
              className="mt-1 min-h-20 w-full rounded-[12px] border border-border bg-bg px-3 py-2 text-text"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Sem cebola, retirar no balcão..."
            />
          </label>

          <div className="mt-4 grid grid-cols-3 gap-2" role="radiogroup" aria-label="Forma de pagamento">
            {(Object.keys(PAYMENT_LABEL) as CounterOrderPaymentMethod[]).map((method) => (
              <button
                key={method}
                role="radio"
                aria-checked={paymentMethod === method}
                className={`rounded-[12px] border px-3 py-2 text-sm font-semibold ${
                  paymentMethod === method ? 'border-brand bg-brand text-on-brand' : 'border-border bg-bg text-text'
                }`}
                onClick={() => setPaymentMethod(method)}
              >
                {PAYMENT_LABEL[method]}
              </button>
            ))}
          </div>

          <div className="mt-5 flex items-center justify-between border-t border-border pt-4">
            <span className="text-sm font-medium text-text-muted">Total</span>
            <span className="text-2xl font-bold tabular-nums text-text">{centsToBRL(totalCents)}</span>
          </div>
          <button
            className="mt-4 w-full rounded-[14px] bg-brand px-4 py-3 text-base font-bold text-on-brand disabled:opacity-50"
            disabled={submitting || cart.length === 0 || !storeId}
            onClick={() => void submitOrder()}
          >
            {submitting ? 'Finalizando…' : 'Finalizar pedido'}
          </button>
        </aside>
      </div>
    </main>
  );
}
