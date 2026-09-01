'use client';

import * as React from 'react';
import { LayoutGrid, List, MapPin, User } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import type { CustomerAddress, DeliveryMatchResponse, StorefrontProduct, StorefrontCategory } from '@molho/contracts';
import {
  MoAddressSheet,
  type MoAddressSheetValue,
  MoCartBar,
  MoCategoryChips,
  MoProductCard,
  MoProductSheet,
  type MoProductSheetSelection,
  formatCents,
} from '@molho/ui';
import { ADDRESS_SCHEMA_VERSION } from '../../lib/address-storage';
import { fetchDeliveryMatch } from '../../lib/delivery-match-api';
import { useAddress } from '../../lib/use-address';
import { useCart } from '../../lib/use-cart';
import { useCustomerToken } from '../../lib/use-customer-token';
import { lookupPostalCode } from '../../lib/viacep';

const LEGAL_TERMS_HREF = 'https://molho.live/termos';
const LEGAL_PRIVACY_HREF = 'https://molho.live/privacidade';

/**
 * Espelhado de packages/contracts/src/copy.pt-BR.ts (COPY.storefront) — só
 * as 2 mensagens que dependem de estado do CLIENTE (fora da zona, pedido
 * mínimo mudam com endereço/carrinho em tempo real). "Loja fechada" não
 * está aqui: é calculada inteira no server component (page.tsx), que
 * importa @molho/contracts sem o risco do Fast Refresh (mesma razão de
 * cart-storage.ts) — chega pronta via prop `closedMessage`.
 */
const COPY_FORA_DA_AREA = 'Ainda não chegamos aí. Mas dá pra retirar no balcão!';
const COPY_PEDIDO_MINIMO = 'Faltam {valor} pra fechar o pedido mínimo da casa.';
/** Cliente que já verificou o telefone nesta loja (pediu antes) ganha uma
 * saudação mais quente — sem round-trip pro nome: o token de sessão em
 * localStorage já entrega essa informação de graça. */
const COPY_SAUDACAO_RECORRENTE = 'Que bom te ver de novo 👋 Bateu a fome?';

function interpolarCopy(template: string, vars: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (bruto, chave: string) => vars[chave] ?? bruto);
}

/**
 * Client component enxuto: só recebe DADOS já resolvidos como props, nunca
 * importa `@molho/contracts` em runtime (o `import type` acima é apagado no
 * build — TS erasure, sem `require()` nenhum sobrando no bundle do
 * cliente). Mesmo padrão de `../home-placeholder.tsx`: o import "de
 * verdade" fica no Server Component (`page.tsx`), que passa strings/objetos
 * planos pra cá. `useCart`/`cart-storage` seguem a mesma regra por dentro
 * (ver comentário longo em `lib/cart-storage.ts`).
 *
 * `StorefrontProduct` é estruturalmente idêntico a `MoProductSheetProduct`
 * (mesmos campos, só `available` sobra) — passa direto pro sheet, sem
 * adaptador.
 */
export interface TenantMenuProps {
  slug: string;
  storeName: string;
  greeting: string;
  categories: StorefrontCategory[];
  minOrderCents: number;
  /** Já formatada por inteiro em page.tsx — `null` quando a loja está aberta agora. */
  closedMessage: string | null;
}

/** Nenhum grupo obrigatório: dá pra adicionar com o "+" sem abrir o detalhe. */
function podeAdicionarRapido(produto: StorefrontProduct): boolean {
  return (
    produto.modifierGroups.every((grupo) => grupo.min === 0) &&
    !produto.comboItems?.some((item) => item.removable)
  );
}

const VISUALIZACAO_STORAGE_KEY = 'molho:storefront:visualizacao-cardapio';

export function TenantMenu({ slug, storeName, greeting, categories, minOrderCents, closedMessage }: TenantMenuProps) {
  const [categoriaAtiva, setCategoriaAtiva] = React.useState<string | null>(categories[0]?.id ?? null);
  // Sempre 'list' no SSR e no primeiro paint (senão a hidratação diverge); lê a
  // preferência salva logo após o mount — o "flash" de 1 frame é preferível.
  const [visualizacao, setVisualizacao] = React.useState<'list' | 'grid'>('list');
  const [produtoSelecionado, setProdutoSelecionado] = React.useState<StorefrontProduct | null>(null);
  const [enderecoSheetAberto, setEnderecoSheetAberto] = React.useState(false);
  const [deliveryMatch, setDeliveryMatch] = React.useState<DeliveryMatchResponse | null>(null);
  const secoesRef = React.useRef<Map<string, HTMLElement>>(new Map());
  const cart = useCart(slug);
  const customerSession = useCustomerToken(slug);
  const saudacao = customerSession.token ? COPY_SAUDACAO_RECORRENTE : greeting;
  const { address, setAddress } = useAddress(slug);
  const router = useRouter();

  React.useEffect(() => {
    if (window.localStorage.getItem(VISUALIZACAO_STORAGE_KEY) === 'grid') setVisualizacao('grid');
  }, []);

  // Roda de novo sempre que o CEP mudar (endereço novo salvo, ou já veio de
  // uma visita anterior) — sem isto, o cliente precisaria reabrir o
  // formulário toda vez só pra reconfirmar cobertura. O número entra quando
  // existe: ele só refina o ponto, a taxa vem da CIDADE (Épico 6, Bloco 2).
  React.useEffect(() => {
    if (!address?.postalCode) {
      setDeliveryMatch(null);
      return;
    }

    let cancelado = false;
    fetchDeliveryMatch(slug, address.postalCode, address.number).then((resultado) => {
      if (!cancelado) setDeliveryMatch(resultado);
    });
    return () => {
      cancelado = true;
    };
  }, [slug, address?.postalCode, address?.number]);

  // Scroll-spy: a seção mais visível vira a categoria ativa nos chips,
  // mesmo quando o cliente rola a página na mão (sem clicar em nenhum chip).
  React.useEffect(() => {
    const secoes = Array.from(secoesRef.current.values());
    if (secoes.length === 0) return;

    const observer = new IntersectionObserver(
      (entradas) => {
        const maisVisivel = entradas
          .filter((entrada) => entrada.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (maisVisivel) setCategoriaAtiva(maisVisivel.target.id);
      },
      // rootMargin negativo no topo: ignora a faixa coberta pelos chips
      // sticky, senão uma seção "conta" como visível um instante antes de
      // realmente aparecer abaixo deles.
      { rootMargin: '-96px 0px -60% 0px', threshold: [0, 0.5, 1] },
    );

    for (const secao of secoes) observer.observe(secao);
    return () => observer.disconnect();
  }, [categories]);

  function trocarVisualizacao(valor: 'list' | 'grid') {
    setVisualizacao(valor);
    window.localStorage.setItem(VISUALIZACAO_STORAGE_KEY, valor);
  }

  function irParaCategoria(id: string) {
    setCategoriaAtiva(id);
    secoesRef.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function adicionarAoCarrinho(produto: StorefrontProduct, selecao: MoProductSheetSelection) {
    cart.addItem({
      lineId: crypto.randomUUID(),
      productId: produto.id,
      ...(produto.offerId ? { offerId: produto.offerId } : {}),
      name: produto.name,
      description: produto.description,
      imageUrl: produto.imageUrl,
      unitBasePriceCents: selecao.unitBasePriceCents,
      ...(selecao.removedChildIds && selecao.removedChildIds.length > 0
        ? { removedChildIds: selecao.removedChildIds }
        : {}),
      modifiers: selecao.modifiers,
      quantity: selecao.quantity,
      notes: selecao.notes,
    });
    setProdutoSelecionado(null);
  }

  function salvarEndereco(valor: MoAddressSheetValue) {
    const novoEndereco: CustomerAddress = {
      schemaVersion: ADDRESS_SCHEMA_VERSION,
      ...valor,
      updatedAt: new Date().toISOString(),
    };
    setAddress(novoEndereco);
    setEnderecoSheetAberto(false);
  }

  function adicaoRapida(produto: StorefrontProduct) {
    cart.addItem({
      lineId: crypto.randomUUID(),
      productId: produto.id,
      ...(produto.offerId ? { offerId: produto.offerId } : {}),
      name: produto.name,
      description: produto.description,
      imageUrl: produto.imageUrl,
      unitBasePriceCents: produto.basePriceCents,
      modifiers: [],
      quantity: 1,
      notes: null,
    });
  }

  const faltamParaMinimo = minOrderCents - cart.subtotalCents;
  const abaixoDoMinimo = cart.itemCount > 0 && faltamParaMinimo > 0;
  const foraDaArea = deliveryMatch?.withinZone === false;

  return (
    <div className="mx-auto max-w-6xl pb-24">
      <header className="flex items-start justify-between gap-2 bg-brand px-4 py-6 text-on-brand">
        <div className="flex flex-col gap-1">
          <h1 className="text-title-lg">{storeName}</h1>
          <p className="text-body opacity-90">{saudacao}</p>
        </div>
        {/* Sem link nenhum pro cardápio, /minha-conta (já com histórico de
            pedidos pronto) ficava só alcançável digitando a URL na mão —
            achado do critique de consumidor. Aparece sempre, mesmo sem
            sessão: a própria página trata o caso "sem pedido ainda" com uma
            mensagem, nunca um formulário de login morto. */}
        <Link
          href={`/${slug}/minha-conta`}
          aria-label="Minha conta"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill text-on-brand transition duration-base ease-out hover:bg-on-brand/10"
        >
          <User className="h-5 w-5" aria-hidden="true" />
        </Link>
      </header>

      <button
        type="button"
        onClick={() => setEnderecoSheetAberto(true)}
        className="flex w-full items-center gap-2 border-b border-border px-4 py-3 text-left text-body text-text-muted transition duration-base ease-out hover:bg-bg-card"
      >
        <MapPin className="h-4 w-4 shrink-0 text-brand-strong" aria-hidden="true" />
        <span className="truncate">
          {address ? `${address.label}: ${address.street}, ${address.number ?? 's/n'}` : 'Adicionar endereço de entrega'}
        </span>
      </button>

      {closedMessage ? <div className="bg-brand-faint px-4 py-3 text-body text-text">{closedMessage}</div> : null}
      {foraDaArea ? <div className="bg-brand-faint px-4 py-3 text-body text-text">{COPY_FORA_DA_AREA}</div> : null}
      {abaixoDoMinimo ? (
        <div className="bg-brand-faint px-4 py-3 text-body text-text">
          {interpolarCopy(COPY_PEDIDO_MINIMO, { valor: formatCents(faltamParaMinimo) })}
        </div>
      ) : null}

      {/* Abaixo de md: chips horizontais rolando (mesmo padrão de sempre).
          md+: coluna fixa de categorias à esquerda — mesma ideia da sidebar
          do gestor, só que sem colapsar (cardápio não precisa disso) e sem
          ícone (categoria não tem um natural). */}
      <MoCategoryChips
        className="md:hidden"
        categories={categories.map((categoria) => ({ id: categoria.id, name: categoria.name }))}
        activeId={categoriaAtiva}
        onSelect={irParaCategoria}
      />

      <div className="md:grid md:grid-cols-[220px_1fr] md:gap-8 md:px-4 md:pt-4">
        <nav
          className="sticky top-4 hidden h-fit flex-col gap-1 self-start md:flex"
          aria-label="Categorias do cardápio"
        >
          {categories.map((categoria) => (
            <button
              key={categoria.id}
              type="button"
              onClick={() => irParaCategoria(categoria.id)}
              aria-current={categoria.id === categoriaAtiva ? 'true' : undefined}
              className={`rounded-[14px] px-3 py-2.5 text-left text-body-strong transition-colors ${
                categoria.id === categoriaAtiva ? 'bg-brand text-on-brand' : 'text-text-muted hover:bg-bg-card hover:text-text'
              }`}
            >
              {categoria.name}
            </button>
          ))}
        </nav>

        <div className="flex flex-col gap-6 p-4 md:p-0">
          {/* Alternância lista/grade: preferência do CLIENTE, não do
              lojista — por isso vive só no localStorage do navegador (mesma
              ideia do `use-sidebar-state` do gestor), nunca no backend. */}
          <div className="flex justify-end gap-1" role="group" aria-label="Visualização do cardápio">
            <button
              type="button"
              onClick={() => trocarVisualizacao('list')}
              aria-pressed={visualizacao === 'list'}
              aria-label="Ver em lista"
              className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors ${
                visualizacao === 'list' ? 'bg-brand text-on-brand' : 'text-text-muted hover:bg-bg-card hover:text-text'
              }`}
            >
              <List className="h-4 w-4" aria-hidden="true" />
            </button>
            <button
              type="button"
              onClick={() => trocarVisualizacao('grid')}
              aria-pressed={visualizacao === 'grid'}
              aria-label="Ver em grade"
              className={`flex h-9 w-9 items-center justify-center rounded-[10px] transition-colors ${
                visualizacao === 'grid' ? 'bg-brand text-on-brand' : 'text-text-muted hover:bg-bg-card hover:text-text'
              }`}
            >
              <LayoutGrid className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>

          {categories.map((categoria) => (
            <section
              key={categoria.id}
              id={categoria.id}
              ref={(elemento) => {
                if (elemento) secoesRef.current.set(categoria.id, elemento);
                else secoesRef.current.delete(categoria.id);
              }}
              className="scroll-mt-16"
            >
              <h2 className="mb-3 text-title text-text md:hidden">{categoria.name}</h2>
              <div className={visualizacao === 'grid' ? 'grid grid-cols-2 gap-4' : 'flex flex-col gap-2'}>
                {categoria.products.map((produto) => (
                  <MoProductCard
                    key={produto.id}
                    variant={visualizacao}
                    name={produto.name}
                    description={produto.description}
                    priceCents={produto.basePriceCents}
                    imageUrl={produto.imageUrl}
                    available={produto.available}
                    onSelect={() => setProdutoSelecionado(produto)}
                    onQuickAdd={podeAdicionarRapido(produto) ? () => adicaoRapida(produto) : undefined}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      </div>

      <MoProductSheet
        open={produtoSelecionado !== null}
        onOpenChange={(open) => {
          if (!open) setProdutoSelecionado(null);
        }}
        product={produtoSelecionado}
        onAddToCart={(selecao) => {
          if (produtoSelecionado) adicionarAoCarrinho(produtoSelecionado, selecao);
        }}
      />

      <MoAddressSheet
        open={enderecoSheetAberto}
        onOpenChange={setEnderecoSheetAberto}
        initialValue={address}
        onLookupPostalCode={lookupPostalCode}
        onSave={salvarEndereco}
      />

      <MoCartBar
        itemCount={cart.itemCount}
        totalCents={cart.subtotalCents}
        onClick={() => router.push(`/${slug}/carrinho`)}
      />

      <footer className="px-4 pb-8 pt-2 text-center text-caption text-text-muted">
        Feito com Molho ·{' '}
        <a href={LEGAL_TERMS_HREF} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
          Termos
        </a>{' '}
        ·{' '}
        <a href={LEGAL_PRIVACY_HREF} className="font-semibold text-brand-strong underline-offset-2 hover:underline">
          Privacidade
        </a>
      </footer>
    </div>
  );
}
