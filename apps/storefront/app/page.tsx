import { COPY, t } from '@molho/contracts';
import { HomePlaceholder } from './home-placeholder';

// Server Component: @molho/contracts é resolvido aqui (SSR/RSC, via require()
// direto), nunca no bundle do cliente. Ver o porquê em ./home-placeholder.tsx.
export default function HomePage() {
  return (
    <HomePlaceholder
      title="Sua loja ainda não tem cardápio"
      description={t(COPY.sistema.emConstrucao, { epico: 5 })}
      ctaLabel={COPY.storefront.carrinhoVazioAcao}
    />
  );
}
