import { CornerBolts } from './corner-bolts';
import { LinkButton } from './link-button';
import { MenuCard } from './menu-card';
import { SIGNUP_URL } from '../lib/urls';

export function Hero() {
  return (
    <section id="produto" className="mx-auto grid max-w-6xl gap-8 px-6 py-10 sm:px-10 lg:grid-cols-2 lg:items-center lg:py-16">
      <div className="relative overflow-hidden rounded-lg bg-brand p-8 shadow-[8px_8px_0_var(--ink-900)] sm:p-10">
        <CornerBolts />

        {/* Mostarda como TEXTO sobre --brand reprova AA em qualquer tamanho
            (2.31:1, medido) — por isso mostarda aqui é sempre FUNDO de chip
            com texto ink por cima (9.19:1), nunca cor de texto direta. */}
        <p className="font-mono text-caption uppercase tracking-wide text-on-brand">
          Chega de comanda no WhatsApp
        </p>

        <h1 className="mt-4 [font-family:var(--font-display)] text-display-lg uppercase leading-tight text-on-brand sm:text-[44px]">
          Tenha seu próprio delivery,{' '}
          <span className="inline-block rounded-sm bg-caution px-2 text-text">livre de taxas</span>.
        </h1>

        <p className="mt-4 text-body-lg text-on-brand">
          Cardápio digital, pedido com PIX e um painel pra cozinha ver tudo em tempo real, pronto
          pra rodar a sexta-feira de pico sem digitar nada no WhatsApp. Mensalidade fixa, sem
          comissão por venda.
        </p>

        <div className="mt-8 flex flex-wrap gap-3">
          <LinkButton href={SIGNUP_URL} variant="mustard">
            Testar 7 dias grátis
          </LinkButton>
          <LinkButton href="#planos" variant="outline-cream">
            Ver os planos
          </LinkButton>
        </div>

        <p className="mt-6 font-mono text-caption uppercase tracking-wide text-on-brand">
          Sem cartão no trial · Loja publicada em 30 min
        </p>
      </div>

      <MenuCard />
    </section>
  );
}
