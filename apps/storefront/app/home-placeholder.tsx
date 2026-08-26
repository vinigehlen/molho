'use client';

import { MoEmptyState } from '@molho/ui';

/**
 * Client component enxuto: só recebe STRINGS já resolvidas, nunca importa
 * @molho/contracts diretamente.
 *
 * Motivo: contracts é CommonJS compilado (dist/), e pnpm resolve o pacote do
 * workspace via symlink direto pra pasta real (sem passar por node_modules no
 * caminho final). O webpack do `next dev`, ao seguir esse symlink, enxerga o
 * arquivo como código de primeira parte — não como dependência de terceiro — e
 * tenta instrumentá-lo com Fast Refresh, injetando `import.meta.webpackHot`
 * num módulo CommonJS. Resultado: "Cannot use 'import.meta' outside a module",
 * só em dev, só quando o import acontece dentro do grafo do bundle client.
 *
 * O backoffice nunca bateu nesse problema porque a página de lá é Server
 * Component: o require() de @molho/contracts roda só no servidor (SSR/RSC),
 * fora do webpack de cliente. Aqui replicamos o mesmo padrão: page.tsx (server)
 * resolve a copy e passa como prop; este componente só cuida do onClick.
 */
export interface HomePlaceholderProps {
  title: string;
  description: string;
  ctaLabel: string;
  signupLabel: string;
  signupHref: string;
}

export function HomePlaceholder({ title, description, ctaLabel, signupLabel, signupHref }: HomePlaceholderProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <MoEmptyState
        title={title}
        description={description}
        action={{
          label: ctaLabel,
          // Sem cardápio próprio ainda pra abrir daqui (nasce no Épico 5) —
          // o clique real disponível hoje é o mesmo do link de baixo: criar
          // a loja. Nunca um botão clicável que não faz nada.
          onClick: () => {
            window.location.href = signupHref;
          },
        }}
      />
      <a className="fixed bottom-6 text-caption font-semibold text-brand-strong" href={signupHref}>
        {signupLabel}
      </a>
    </main>
  );
}
