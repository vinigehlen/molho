'use client';

import * as React from 'react';
import type { StorefrontCategory } from '@molho/contracts';
import { MoCategoryChips, MoProductCard } from '@molho/ui';

/**
 * Client component enxuto: só recebe DADOS já resolvidos como props, nunca
 * importa `@molho/contracts` em runtime (o `import type` acima é apagado no
 * build — TS erasure, sem `require()` nenhum sobrando no bundle do
 * cliente). Mesmo padrão de `../home-placeholder.tsx`: o import "de
 * verdade" fica no Server Component (`page.tsx`), que passa strings/objetos
 * planos pra cá.
 *
 * Cuida só de UI de navegação (qual chip está ativo, rolar até a seção) —
 * nenhuma lógica de negócio mora aqui.
 *
 * `MoProductCard` ainda não recebe `onSelect`/`onQuickAdd`: abrir o
 * detalhe e adicionar ao carrinho chegam no Épico 5 commit 7 (estado do
 * carrinho). Até lá, os cards ficam visíveis mas não clicáveis — estado já
 * suportado pelo componente (Épico 5 commit 4), não um bug temporário.
 */
export interface TenantMenuProps {
  storeName: string;
  greeting: string;
  categories: StorefrontCategory[];
}

export function TenantMenu({ storeName, greeting, categories }: TenantMenuProps) {
  const [categoriaAtiva, setCategoriaAtiva] = React.useState<string | null>(categories[0]?.id ?? null);
  const secoesRef = React.useRef<Map<string, HTMLElement>>(new Map());

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

  function irParaCategoria(id: string) {
    setCategoriaAtiva(id);
    secoesRef.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  return (
    <div className="pb-24">
      <header className="flex flex-col gap-1 bg-brand px-4 py-6 text-on-brand">
        <h1 className="text-title-lg">{storeName}</h1>
        <p className="text-body opacity-90">{greeting}</p>
      </header>

      <MoCategoryChips
        categories={categories.map((categoria) => ({ id: categoria.id, name: categoria.name }))}
        activeId={categoriaAtiva}
        onSelect={irParaCategoria}
      />

      <div className="flex flex-col gap-8 p-4">
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
            <h2 className="mb-3 text-title text-text">{categoria.name}</h2>
            <div className="grid grid-cols-2 gap-4">
              {categoria.products.map((produto) => (
                <MoProductCard
                  key={produto.id}
                  name={produto.name}
                  description={produto.description}
                  priceCents={produto.basePriceCents}
                  imageUrl={produto.imageUrl}
                  available={produto.available}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
