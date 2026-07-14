import { COPY, t } from '@molho/contracts';
import { MoCard, MoCardContent, MoCardHeader, MoCardTitle } from '@molho/ui';

export default function HomePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-bg p-6">
      <MoCard className="max-w-sm">
        <MoCardHeader>
          <MoCardTitle>Olá, super-admin</MoCardTitle>
        </MoCardHeader>
        <MoCardContent className="pt-2">{t(COPY.sistema.emConstrucao, { epico: 14 })}</MoCardContent>
      </MoCard>
    </main>
  );
}
