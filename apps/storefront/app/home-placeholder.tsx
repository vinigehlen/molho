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
}

export function HomePlaceholder({ title, description, ctaLabel }: HomePlaceholderProps) {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <MoEmptyState
        title={title}
        description={description}
        action={{
          label: ctaLabel,
          // Sem destino real ainda — o cardápio nasce no Épico 5. O slot de
          // ação já existe; o clique ganha função quando o menu existir.
          onClick: () => {},
        }}
      />
    </main>
  );
}
