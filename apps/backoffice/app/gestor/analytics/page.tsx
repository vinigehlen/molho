'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { BarChart3, CalendarDays, RefreshCw, Store, TrendingUp } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  AnalyticsCustomer,
  AnalyticsFulfillment,
  AnalyticsIdleItem,
  AnalyticsOverview,
  AnalyticsPeakHour,
  AnalyticsRegion,
  AnalyticsTimeseriesPoint,
  AnalyticsTopItem,
  AnalyticsTopItemsSort,
} from '@molho/contracts';
import {
  fetchAnalyticsCustomers,
  fetchAnalyticsIdleItems,
  fetchAnalyticsOverview,
  fetchAnalyticsPeakHours,
  fetchAnalyticsRegions,
  fetchAnalyticsTimeseries,
  fetchAnalyticsTopItems,
  type AnalyticsFilters,
} from '../../../lib/analytics-api';
import { centsToBRL } from '../../../lib/format';
import { fetchMyStores, type StaffStore } from '../../../lib/my-stores-api';

const BRAND = 'var(--brand)';
const GRID = 'var(--border)';
const COLORS = ['var(--brand)', 'var(--info)', 'var(--positive)'];
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultFilters(): AnalyticsFilters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from: isoDate(from), to: isoDate(to), fulfillment: 'all' };
}

function fmtMoneyTick(value: number): string {
  const reais = value / 100;
  if (reais >= 1000) return `R$ ${Math.round(reais / 1000)} mil`;
  return `R$ ${Math.round(reais)}`;
}

function fulfillmentLabel(value: AnalyticsFulfillment): string {
  if (value === 'delivery') return 'Delivery';
  if (value === 'pickup') return 'Retirada';
  return 'Balcão';
}

interface DataState {
  overview: AnalyticsOverview | null;
  timeseries: AnalyticsTimeseriesPoint[];
  peakHours: AnalyticsPeakHour[];
  topItems: AnalyticsTopItem[];
  customers: AnalyticsCustomer[] | null;
  regions: AnalyticsRegion[];
  idleItems: AnalyticsIdleItem[];
}

const EMPTY_DATA: DataState = {
  overview: null,
  timeseries: [],
  peakHours: [],
  topItems: [],
  customers: null,
  regions: [],
  idleItems: [],
};

export default function AnalyticsPage() {
  const [stores, setStores] = useState<StaffStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [filters, setFilters] = useState(defaultFilters);
  const [topSort, setTopSort] = useState<AnalyticsTopItemsSort>('qty');
  // "Atualizar" refaz o fetch com os MESMOS filtros — precisa de um sinal
  // próprio na dependência do efeito; `setFilters({ ...filters })` fingindo
  // objeto novo pra disparar o efeito era implícito e quebraria silenciosamente
  // se `filters` virasse algo comparado por valor em vez de referência.
  const [refreshToken, setRefreshToken] = useState(0);
  const [data, setData] = useState<DataState>(EMPTY_DATA);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const list = await fetchMyStores();
        if (cancelled) return;
        setStores(list);
        setStoreId(list[0]?.id ?? '');
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Falha ao carregar lojas.');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const [overview, timeseries, peakHours, topItems, customers, regions, idleItems] = await Promise.all([
          fetchAnalyticsOverview(storeId, filters),
          fetchAnalyticsTimeseries(storeId, filters, 'day'),
          fetchAnalyticsPeakHours(storeId, filters),
          fetchAnalyticsTopItems(storeId, filters, topSort),
          fetchAnalyticsCustomers(storeId, filters),
          fetchAnalyticsRegions(storeId, filters),
          fetchAnalyticsIdleItems(storeId, filters),
        ]);
        if (cancelled) return;
        setData({ overview, timeseries, peakHours, topItems, customers, regions, idleItems });
      } catch (err) {
        if (!cancelled) {
          setData(EMPTY_DATA);
          setError(err instanceof Error ? err.message : 'Falha ao carregar analytics.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, storeId, topSort, refreshToken]);

  const heatMax = useMemo(() => Math.max(1, ...data.peakHours.map((point) => point.pedidos)), [data.peakHours]);
  const heatGrid = useMemo(() => {
    const map = new Map(data.peakHours.map((point) => [`${point.dow}-${point.hour}`, point]));
    return DOW.map((label, dow) => ({ label, hours: Array.from({ length: 24 }, (_, hour) => map.get(`${dow}-${hour}`) ?? { dow, hour, pedidos: 0, faturamentoCents: 0 }) }));
  }, [data.peakHours]);

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-text sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand">
              <BarChart3 size={16} /> Analytics
            </p>
            <h1 className="mt-2 text-2xl font-bold text-text sm:text-3xl">Performance da loja</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-text-muted">
              Loja
              <select className="mt-1 h-10 w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm text-text" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>
                    {store.name}
                  </option>
                ))}
              </select>
            </label>
            <DateInput label="De" value={filters.from} onChange={(from) => setFilters((current) => ({ ...current, from }))} />
            <DateInput label="Até" value={filters.to} onChange={(to) => setFilters((current) => ({ ...current, to }))} />
            <label className="text-xs font-semibold text-text-muted">
              Canal
              <select
                className="mt-1 h-10 w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm text-text"
                value={filters.fulfillment ?? 'all'}
                onChange={(event) => setFilters((current) => ({ ...current, fulfillment: event.target.value as AnalyticsFilters['fulfillment'] }))}
              >
                <option value="all">Todos</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Retirada</option>
                <option value="balcao">Balcão</option>
              </select>
            </label>
            <button
              className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[14px] bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-60 sm:mt-5"
              disabled={loading}
              onClick={() => setRefreshToken((token) => token + 1)}
            >
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </header>

        {error ? (
          <div role="alert" className="rounded-[20px] border border-critical bg-bg-card px-4 py-3 text-sm font-medium text-critical">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4 md:grid-cols-4">
          <Kpi title="Faturamento realizado" value={centsToBRL(data.overview?.realizado.faturamentoCents ?? 0)} icon={<TrendingUp size={18} />} />
          <Kpi title="Pedidos realizados" value={String(data.overview?.realizado.pedidos ?? 0)} icon={<Store size={18} />} />
          <Kpi title="Ticket médio" value={centsToBRL(data.overview?.realizado.ticketMedioCents ?? 0)} icon={<CalendarDays size={18} />} />
          <Kpi title="Em aberto" value={centsToBRL(data.overview?.emAberto.faturamentoCents ?? 0)} detail={`${data.overview?.emAberto.pedidos ?? 0} pedidos`} icon={<BarChart3 size={18} />} />
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(0,1.8fr)_minmax(320px,1fr)]">
          <Panel title="Faturamento por dia" loading={loading}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={data.timeseries}>
                  <CartesianGrid stroke={GRID} vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                  <YAxis tickFormatter={fmtMoneyTick} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(value) => [centsToBRL(Number(value)), 'Faturamento']} />
                  <Line type="monotone" dataKey="faturamentoCents" stroke={BRAND} strokeWidth={3} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Split por canal" loading={loading}>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={data.overview?.fulfillment ?? []} dataKey="faturamentoCents" nameKey="tipo" innerRadius={62} outerRadius={100} paddingAngle={2}>
                    {(data.overview?.fulfillment ?? []).map((entry, index) => (
                      <Cell key={entry.tipo} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(value, _name, item) => [centsToBRL(Number(value)), fulfillmentLabel(item.payload.tipo)]} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="grid gap-2">
              {(data.overview?.fulfillment ?? []).map((item, index) => (
                <div key={item.tipo} className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2"><span className="h-3 w-3 rounded-full" style={{ backgroundColor: COLORS[index % COLORS.length] }} />{fulfillmentLabel(item.tipo)}</span>
                  <span className="font-semibold">{item.pedidos} pedidos</span>
                </div>
              ))}
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 xl:grid-cols-[minmax(320px,1fr)_minmax(0,1.4fr)]">
          <Panel
            title="Itens mais vendidos"
            action={
              <select className="h-9 rounded-[14px] border border-border bg-bg-card px-2 text-xs font-semibold" value={topSort} onChange={(event) => setTopSort(event.target.value as AnalyticsTopItemsSort)}>
                <option value="qty">Unidades</option>
                <option value="revenue">Receita</option>
              </select>
            }
            loading={loading}
          >
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.topItems} layout="vertical" margin={{ left: 24 }}>
                  <CartesianGrid stroke={GRID} horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis dataKey="nome" type="category" tick={{ fontSize: 12 }} width={120} />
                  <Tooltip formatter={(value, name) => (name === 'faturamentoCents' ? centsToBRL(Number(value)) : Number(value))} />
                  <Bar dataKey={topSort === 'qty' ? 'unidades' : 'faturamentoCents'} fill={BRAND} radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Panel>

          <Panel title="Horário de pico" loading={loading}>
            <div className="overflow-x-auto">
              <div className="grid min-w-[720px] gap-1" style={{ gridTemplateColumns: '48px repeat(24, minmax(20px, 1fr))' }}>
                <div />
                {Array.from({ length: 24 }, (_, hour) => (
                  <div key={hour} className="text-center text-[10px] font-semibold text-text-muted">{hour}</div>
                ))}
                {heatGrid.map((row) => (
                  <React.Fragment key={row.label}>
                    <div className="flex h-6 items-center text-xs font-semibold text-text-muted">{row.label}</div>
                    {row.hours.map((point) => (
                      <div
                        key={`${point.dow}-${point.hour}`}
                        tabIndex={0}
                        aria-label={`${row.label} ${point.hour}h: ${point.pedidos} pedidos`}
                        className="h-6 rounded-[4px] focus-visible:outline-none focus-visible:shadow-focus"
                        title={`${row.label} ${point.hour}h: ${point.pedidos} pedidos`}
                        style={{ backgroundColor: `rgba(214, 58, 30, ${0.08 + (point.pedidos / heatMax) * 0.82})` }}
                      />
                    ))}
                  </React.Fragment>
                ))}
              </div>
            </div>
          </Panel>
        </section>

        <section className="grid gap-6 lg:grid-cols-3">
          <TablePanel title="Clientes" columns={['Cliente', 'Telefone', 'Faturamento']} rows={data.customers} forbiddenText="Disponível para owner e manager.">
            {(row: AnalyticsCustomer) => (
              <tr key={row.customerId}>
                <td className="py-3 pr-3">{row.nomeMascarado ?? 'Cliente'}</td>
                <td className="py-3 pr-3 text-text-muted">{row.telefoneMascarado ?? 'Telefone mascarado'}</td>
                <td className="py-3 text-right font-semibold">{centsToBRL(row.faturamentoCents)}</td>
              </tr>
            )}
          </TablePanel>
          <TablePanel title="Regiões" columns={['Cidade', 'UF', 'Faturamento']} rows={data.regions}>
            {(row: AnalyticsRegion) => (
              <tr key={row.cityKey ?? 'sem-regiao'}>
                <td className="py-3 pr-3">{row.cidade}</td>
                <td className="py-3 pr-3 text-text-muted">{row.uf ?? '-'}</td>
                <td className="py-3 text-right font-semibold">{centsToBRL(row.faturamentoCents)}</td>
              </tr>
            )}
          </TablePanel>
          <TablePanel title="Itens sem venda" columns={['Item', 'Categoria', 'Vendas']} rows={data.idleItems}>
            {(row: AnalyticsIdleItem) => (
              <tr key={row.productId}>
                <td className="py-3 pr-3">{row.nome}</td>
                <td className="py-3 pr-3 text-text-muted">{row.categoria}</td>
                <td className="py-3 text-right font-semibold">0</td>
              </tr>
            )}
          </TablePanel>
        </section>
      </div>
    </main>
  );
}

function DateInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-text-muted">
      {label}
      <input className="mt-1 h-10 w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm text-text" type="date" value={value} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function Kpi({ title, value, detail, icon }: { title: string; value: string; detail?: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-[20px] border border-border bg-bg-card p-4">
      <div className="flex items-center justify-between text-text-muted">
        <span className="text-xs font-semibold uppercase tracking-wide">{title}</span>
        {icon}
      </div>
      <strong className="mt-3 block text-2xl font-bold text-text">{value}</strong>
      {detail ? <span className="mt-1 block text-sm text-text-muted">{detail}</span> : null}
    </article>
  );
}

function Panel({ title, action, loading, children }: { title: string; action?: React.ReactNode; loading?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-border bg-bg-card p-4">
      <div className="mb-4 flex min-h-9 items-center justify-between gap-3">
        <h2 className="text-base font-bold text-text">{title}</h2>
        {action}
      </div>
      <div className={loading ? 'opacity-55' : ''}>{children}</div>
    </section>
  );
}

function TablePanel<T>({
  title,
  columns,
  rows,
  forbiddenText,
  children,
}: {
  title: string;
  /** Rótulos das colunas — sem isso a tabela não tem `<th>` nenhum pro leitor de tela. */
  columns: string[];
  rows: T[] | null;
  forbiddenText?: string;
  children: (row: T) => React.ReactNode;
}) {
  return (
    <section className="rounded-[20px] border border-border bg-bg-card p-4">
      <h2 className="text-base font-bold text-text">{title}</h2>
      {rows === null ? (
        <p className="mt-4 text-sm text-text-muted">{forbiddenText ?? 'Sem acesso.'}</p>
      ) : rows.length === 0 ? (
        <p className="mt-4 text-sm text-text-muted">Sem dados no período.</p>
      ) : (
        <div className="mt-3 max-h-80 overflow-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-text-muted">
                {columns.map((column, i) => (
                  <th
                    key={column}
                    scope="col"
                    className={i === columns.length - 1 ? 'py-2 text-right font-semibold' : 'py-2 pr-3 font-semibold'}
                  >
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">{rows.map((row) => children(row))}</tbody>
          </table>
        </div>
      )}
    </section>
  );
}
