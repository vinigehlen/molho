import { LinkButton } from './link-button';
import { SIGNUP_URL } from '../lib/urls';

export function FinalCta() {
  return (
    <section className="bg-cream px-6 py-16 text-center sm:px-10">
      <div className="mx-auto max-w-3xl">
        <h2 className="[font-family:var(--font-display)] text-display uppercase text-brand-strong">
          Sua casa já tem o sabor. Falta o cardápio chegar até quem tá em casa.
        </h2>
        <p className="mt-4 text-body-lg text-text-muted">7 dias grátis, sem cartão. Publica em menos de 30 minutos.</p>
        <LinkButton href={SIGNUP_URL} variant="primary" className="mt-8">
          Testar 7 dias grátis
        </LinkButton>
      </div>
    </section>
  );
}
