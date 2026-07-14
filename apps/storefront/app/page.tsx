'use client';

import { COPY, t } from '@molho/contracts';
import { MoEmptyState } from '@molho/ui';

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <MoEmptyState
        title="Sua loja ainda não tem cardápio"
        description={t(COPY.sistema.emConstrucao, { epico: 5 })}
        action={{
          label: COPY.storefront.carrinhoVazioAcao,
          // Sem destino real ainda — o cardápio nasce no Épico 5. O slot de
          // ação já existe; o clique ganha função quando o menu existir.
          onClick: () => {},
        }}
      />
    </main>
  );
}
