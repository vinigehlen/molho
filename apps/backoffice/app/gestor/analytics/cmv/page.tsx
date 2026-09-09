'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Beef, BookOpen, Boxes, RefreshCw, SlidersHorizontal, Target, TrendingDown, TrendingUp } from 'lucide-react';
import { Bar, CartesianGrid, Cell, ComposedChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis } from 'recharts';
import type { CmvDashboard, CmvIngredient, CmvProductRankingItem, CmvRecipeSummary } from '@molho/contracts';
import type { AnalyticsFilters } from '../../../../lib/analytics-api';
import { fetchCmvDashboard, fetchCmvIngredients, fetchCmvRecipes } from '../../../../lib/cmv-api';
import { centsToBRL } from '../../../../lib/format';
import { fetchMyStores, type StaffStore } from '../../../../lib/my-stores-api';

const BRAND = 'var(--brand)';
const GRID = 'var(--border)';
const GOOD = 'var(--positive)';
const WARN = 'var(--caution)';
const BAD = 'var(--critical)';
const INFO = 'var(--info)';

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function defaultFilters(): AnalyticsFilters {
  const to = new Date();
  const from = new Date(to);
  from.setDate(from.getDate() - 30);
  return { from: isoDate(from), to: isoDate(to), fulfillment: 'all' };
}

function pct(value: number): string {
  return `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function moneyTick(value: number): string {
  const reais = value / 100;
  if (reais >= 1000) return `R$ ${Math.round(reais / 1000)} mil`;
  return `R$ ${Math.round(reais)}`;
}

function statusColor(status: CmvProductRankingItem['status']) {
  if (status === 'vermelho') return BAD;
  if (status === 'amarelo') return WARN;
  if (status === 'sem_ficha') return INFO;
  return GOOD;
}

const EMPTY: CmvDashboard = {
  kpis: {
    receitaLiquidaCents: 0,
    cmvTeoricoCents: 0,
    cmvTeoricoPercent: 0,
    margemBrutaCents: 0,
    margemBrutaPercent: 0,
    contribuicaoCents: 0,
    contribuicaoPercent: 0,
    pedidos: 0,
    ticketMedioCents: 0,
    produtosSemFicha: 0,
    custosEstimados: 0,
  },
  timeseries: [],
  ranking: [],
};

export default function CmvPage() {
  const [stores, setStores] = useState<StaffStore[]>([]);
  const [storeId, setStoreId] = useState('');
  const [filters, setFilters] = useState(defaultFilters);
  const [tab, setTab] = useState<'dashboard' | 'recipes' | 'ingredients' | 'inventory' | 'settings'>('dashboard');
  const [dashboard, setDashboard] = useState<CmvDashboard>(EMPTY);
  const [ingredients, setIngredients] = useState<CmvIngredient[]>([]);
  const [recipes, setRecipes] = useState<CmvRecipeSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshToken, setRefreshToken] = useState(0);
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
        const [nextDashboard, nextIngredients, nextRecipes] = await Promise.all([
          fetchCmvDashboard(storeId, filters),
          fetchCmvIngredients(storeId),
          fetchCmvRecipes(storeId),
        ]);
        if (cancelled) return;
        setDashboard(nextDashboard);
        setIngredients(nextIngredients);
        setRecipes(nextRecipes);
      } catch (err) {
        if (!cancelled) {
          setDashboard(EMPTY);
          setIngredients([]);
          setRecipes([]);
          setError(err instanceof Error ? err.message : 'Falha ao carregar CMV.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [filters, refreshToken, storeId]);

  const alerts = useMemo(() => dashboard.ranking.filter((item) => item.status === 'vermelho' || !item.hasRecipe).slice(0, 5), [dashboard.ranking]);
  const scatter = useMemo(() => dashboard.ranking.map((item) => ({ ...item, x: item.vendidos, y: item.margemUnitariaCents ?? 0 })), [dashboard.ranking]);

  return (
    <main className="min-h-screen bg-bg px-4 py-6 text-text sm:px-6 lg:px-8">
      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <header className="flex flex-col gap-4 border-b border-border pb-5 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-brand">
              <Beef size={16} /> Analytics
            </p>
            <h1 className="mt-2 text-2xl font-bold text-text sm:text-3xl">CMV</h1>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <label className="text-xs font-semibold text-text-muted">
              Loja
              <select className="mt-1 h-10 w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm text-text" value={storeId} onChange={(event) => setStoreId(event.target.value)}>
                {stores.map((store) => (
                  <option key={store.id} value={store.id}>{store.name}</option>
                ))}
              </select>
            </label>
            <DateInput label="De" value={filters.from} onChange={(from) => setFilters((current) => ({ ...current, from }))} />
            <DateInput label="Até" value={filters.to} onChange={(to) => setFilters((current) => ({ ...current, to }))} />
            <label className="text-xs font-semibold text-text-muted">
              Canal
              <select className="mt-1 h-10 w-full rounded-[14px] border border-border bg-bg-card px-3 text-sm text-text" value={filters.fulfillment ?? 'all'} onChange={(event) => setFilters((current) => ({ ...current, fulfillment: event.target.value as AnalyticsFilters['fulfillment'] }))}>
                <option value="all">Todos</option>
                <option value="delivery">Delivery</option>
                <option value="pickup">Retirada</option>
                <option value="balcao">Balcão</option>
              </select>
            </label>
            <button className="mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-[14px] bg-brand px-4 text-sm font-semibold text-on-brand disabled:opacity-60 sm:mt-5" disabled={loading} onClick={() => setRefreshToken((token) => token + 1)}>
              <RefreshCw size={16} className={loading ? 'animate-spin' : ''} /> Atualizar
            </button>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto pb-1">
          <TabButton active={tab === 'dashboard'} onClick={() => setTab('dashboard')} icon={<TrendingUp size={16} />} label="Dashboard" />
          <TabButton active={tab === 'recipes'} onClick={() => setTab('recipes')} icon={<BookOpen size={16} />} label="Produtos & fichas" />
          <TabButton active={tab === 'ingredients'} onClick={() => setTab('ingredients')} icon={<Boxes size={16} />} label="Insumos & custos" />
          <TabButton active={tab === 'inventory'} onClick={() => setTab('inventory')} icon={<TrendingDown size={16} />} label="Inventário" />
          <TabButton active={tab === 'settings'} onClick={() => setTab('settings')} icon={<SlidersHorizontal size={16} />} label="Configurações" />
        </div>

        {error ? <div role="alert" className="rounded-[20px] border border-critical bg-bg-card px-4 py-3 text-sm font-medium text-critical">{error}</div> : null}

        {tab === 'dashboard' ? <DashboardView dashboard={dashboard} alerts={alerts} scatter={scatter} loading={loading} /> : null}
        {tab === 'recipes' ? <RecipesView recipes={recipes} ranking={dashboard.ranking} loading={loading} /> : null}
        {tab === 'ingredients' ? <IngredientsView ingredients={ingredients} loading={loading} /> : null}
        {tab === 'inventory' ? <Placeholder title="Inventário / CMV real" text="A estrutura de CMV real já está separada do teórico. A próxima fatia abre contagens, compras manuais e comparação real x teórico sem mexer nas fichas." /> : null}
        {tab === 'settings' ? <Placeholder title="Metas de CMV" text="A régua inicial usa verde até 30%, amarelo até 35% e vermelho acima disso. A próxima fatia grava metas por categoria." /> : null}
      </div>
    </main>
  );
}

function DashboardView({ dashboard, alerts, scatter, loading }: { dashboard: CmvDashboard; alerts: CmvProductRankingItem[]; scatter: CmvProductRankingItem[]; loading: boolean }) {
  return (
    <>
      <section className="grid gap-4 md:grid-cols-4">
        <Kpi title="Receita líquida" value={centsToBRL(dashboard.kpis.receitaLiquidaCents)} icon={<TrendingUp size={18} />} />
        <Kpi title="CMV teórico" value={centsToBRL(dashboard.kpis.cmvTeoricoCents)} detail={pct(dashboard.kpis.cmvTeoricoPercent)} icon={<Target size={18} />} />
        <Kpi title="Margem bruta" value={centsToBRL(dashboard.kpis.margemBrutaCents)} detail={pct(dashboard.kpis.margemBrutaPercent)} icon={<Beef size={18} />} />
        <Kpi title="Ticket médio" value={centsToBRL(dashboard.kpis.ticketMedioCents)} detail={`${dashboard.kpis.pedidos} pedidos`} icon={<BookOpen size={18} />} />
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Panel title="Receita x CMV x margem" loading={loading}>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={dashboard.timeseries}>
                <CartesianGrid stroke={GRID} vertical={false} />
                <XAxis dataKey="bucket" tick={{ fontSize: 12 }} />
                <YAxis tickFormatter={moneyTick} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => [centsToBRL(Number(value)), name === 'receitaLiquidaCents' ? 'Receita' : name === 'cmvTeoricoCents' ? 'CMV' : 'Margem']} />
                <Bar dataKey="receitaLiquidaCents" fill={BRAND} radius={[8, 8, 0, 0]} />
                <Bar dataKey="cmvTeoricoCents" fill={WARN} radius={[8, 8, 0, 0]} />
                <Bar dataKey="margemBrutaCents" fill={GOOD} radius={[8, 8, 0, 0]} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel title="Alertas" loading={loading}>
          <div className="grid gap-3">
            {alerts.length === 0 ? <p className="text-sm text-text-muted">Nenhum alerta no período.</p> : null}
            {alerts.map((item) => (
              <div key={item.productId} className="flex items-center justify-between rounded-[14px] border border-border px-3 py-3">
                <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                  <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: statusColor(item.status) }} />
                  <span className="truncate">{item.nome}</span>
                </span>
                <span className="text-sm font-semibold">{item.hasRecipe ? pct(item.cmvPercent) : 'sem ficha'}</span>
              </div>
            ))}
          </div>
        </Panel>
      </section>

      <section className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <Panel title="Ranking de produtos" loading={loading}>
          <ProductTable rows={dashboard.ranking} />
        </Panel>
        <Panel title="Engenharia de cardápio" loading={loading}>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart>
                <CartesianGrid stroke={GRID} />
                <XAxis type="number" dataKey="x" name="Vendidos" tick={{ fontSize: 12 }} />
                <YAxis type="number" dataKey="y" name="Margem un." tickFormatter={moneyTick} tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value, name) => [name === 'Margem un.' ? centsToBRL(Number(value)) : value, name]} cursor={{ strokeDasharray: '3 3' }} />
                <Scatter data={scatter}>
                  {scatter.map((item) => <Cell key={item.productId} fill={statusColor(item.status)} />)}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </Panel>
      </section>
    </>
  );
}

function RecipesView({ recipes, ranking, loading }: { recipes: CmvRecipeSummary[]; ranking: CmvProductRankingItem[]; loading: boolean }) {
  const byProduct = new Map(ranking.map((item) => [item.productId, item]));
  return (
    <Panel title="Produtos & fichas" loading={loading}>
      <div className="grid gap-4 lg:grid-cols-2">
        {recipes.map((recipe) => {
          const product = recipe.productId ? byProduct.get(recipe.productId) : undefined;
          return (
            <article key={recipe.recipeId} className="rounded-[20px] border border-border bg-bg-card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="text-base font-semibold">{recipe.nome}</h2>
                  <p className="text-sm text-text-muted">{recipe.tipo === 'MENU_ITEM' ? 'Produto vendido' : 'Subreceita'}{recipe.isTestData ? ' · custo de teste' : ''}</p>
                </div>
                <span className="rounded-full bg-brand-subtle px-3 py-1 text-sm font-semibold text-brand-strong">{centsToBRL(recipe.custoTotalCents)}</span>
              </div>
              {product ? <p className="mt-3 text-sm text-text-muted">CMV {pct(product.cmvPercent)} · margem unitária {product.margemUnitariaCents === null ? 'sem dados' : centsToBRL(product.margemUnitariaCents)}</p> : null}
              <div className="mt-4 grid gap-2">
                {recipe.components.slice(0, 6).map((component) => (
                  <div key={`${recipe.recipeId}-${component.nome}-${component.quantidade}`} className="flex justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate">{component.nome}</span>
                    <span className="shrink-0 font-medium">{component.quantidade.toLocaleString('pt-BR')} {component.unidade} · {centsToBRL(component.custoTotalCents)}</span>
                  </div>
                ))}
              </div>
            </article>
          );
        })}
      </div>
    </Panel>
  );
}

function IngredientsView({ ingredients, loading }: { ingredients: CmvIngredient[]; loading: boolean }) {
  return (
    <Panel title="Insumos & custos" loading={loading}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] border-separate border-spacing-0 text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-text-muted">
            <tr>
              <th className="border-b border-border px-3 py-2">Insumo</th>
              <th className="border-b border-border px-3 py-2">Unidade</th>
              <th className="border-b border-border px-3 py-2 text-right">Custo atual</th>
              <th className="border-b border-border px-3 py-2 text-right">Rendimento</th>
              <th className="border-b border-border px-3 py-2 text-right">Produtos afetados</th>
              <th className="border-b border-border px-3 py-2">Origem</th>
            </tr>
          </thead>
          <tbody>
            {ingredients.map((item) => (
              <tr key={item.id}>
                <td className="border-b border-border px-3 py-3 font-medium">{item.nome}<span className="ml-2 text-xs font-normal text-text-muted">{item.categoria}</span></td>
                <td className="border-b border-border px-3 py-3">{item.unidadeBase}</td>
                <td className="border-b border-border px-3 py-3 text-right font-semibold">{centsToBRL(item.custoAtualCents)}</td>
                <td className="border-b border-border px-3 py-3 text-right">{pct(item.rendimentoPercent)}</td>
                <td className="border-b border-border px-3 py-3 text-right">{item.produtosAfetados}</td>
                <td className="border-b border-border px-3 py-3">{item.isTestData ? 'teste' : 'real'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function ProductTable({ rows }: { rows: CmvProductRankingItem[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[900px] border-separate border-spacing-0 text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-text-muted">
          <tr>
            <th className="border-b border-border px-3 py-2">Produto</th>
            <th className="border-b border-border px-3 py-2 text-right">Vendidos</th>
            <th className="border-b border-border px-3 py-2 text-right">Receita</th>
            <th className="border-b border-border px-3 py-2 text-right">CMV un.</th>
            <th className="border-b border-border px-3 py-2 text-right">CMV %</th>
            <th className="border-b border-border px-3 py-2 text-right">Contribuição</th>
            <th className="border-b border-border px-3 py-2 text-right">Mix</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productId}>
              <td className="border-b border-border px-3 py-3">
                <span className="flex min-w-0 items-center gap-2 font-medium"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: statusColor(row.status) }} />{row.nome}</span>
                <span className="text-xs text-text-muted">{row.categoria} · {row.quadrant.replaceAll('_', ' ')}</span>
              </td>
              <td className="border-b border-border px-3 py-3 text-right">{row.vendidos}</td>
              <td className="border-b border-border px-3 py-3 text-right font-semibold">{centsToBRL(row.receitaLiquidaCents)}</td>
              <td className="border-b border-border px-3 py-3 text-right">{row.cmvUnitarioCents === null ? 'sem ficha' : centsToBRL(row.cmvUnitarioCents)}</td>
              <td className="border-b border-border px-3 py-3 text-right">{pct(row.cmvPercent)}</td>
              <td className="border-b border-border px-3 py-3 text-right">{centsToBRL(row.contribuicaoCents)}</td>
              <td className="border-b border-border px-3 py-3 text-right">{pct(row.mixPercent)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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

function TabButton({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return <button type="button" onClick={onClick} className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full px-4 text-sm font-semibold ${active ? 'bg-brand text-on-brand' : 'bg-bg-card text-text-muted hover:text-text'}`}>{icon}{label}</button>;
}

function Kpi({ title, value, detail, icon }: { title: string; value: string; detail?: string; icon: React.ReactNode }) {
  return (
    <article className="rounded-[20px] border border-border bg-bg-card p-4 shadow-1">
      <div className="flex items-center justify-between gap-3 text-text-muted">
        <p className="text-sm font-medium">{title}</p>
        {icon}
      </div>
      <p className="mt-3 text-2xl font-bold tabular-nums">{value}</p>
      {detail ? <p className="mt-1 text-sm text-text-muted">{detail}</p> : null}
    </article>
  );
}

function Panel({ title, loading, children }: { title: string; loading?: boolean; children: React.ReactNode }) {
  return (
    <section className="rounded-[20px] border border-border bg-bg-card p-4 shadow-1">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{title}</h2>
        {loading ? <RefreshCw className="h-4 w-4 animate-spin text-text-muted" aria-label="Carregando" /> : null}
      </div>
      {children}
    </section>
  );
}

function Placeholder({ title, text }: { title: string; text: string }) {
  return (
    <section className="rounded-[20px] border border-dashed border-border bg-bg-card p-6">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-text-muted">{text}</p>
    </section>
  );
}
