import { COPY, t } from '@molho/contracts';
import { HomePlaceholder } from './home-placeholder';

// Server Component: @molho/contracts é resolvido aqui (SSR/RSC, via require()
// direto), nunca no bundle do cliente. Ver o porquê em ./home-placeholder.tsx.
export default function HomePage() {
  const backofficeUrl = process.env.NEXT_PUBLIC_BACKOFFICE_URL ?? 'http://localhost:3001';
  return (
    <HomePlaceholder
      title="Sua loja ainda não tem cardápio"
      description={t(COPY.sistema.emConstrucao, { epico: 5 })}
      ctaLabel="Criar minha loja"
      signupLabel="Crie seu restaurante"
      signupHref={`${backofficeUrl}/signup`}
    />
  );
}
