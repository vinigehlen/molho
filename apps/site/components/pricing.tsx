import { LinkButton } from './link-button';
import { SIGNUP_URL } from '../lib/urls';

/**
 * `emBreve` marca bullets que hoje são roadmap, não produto entregue
 * (docs/13-landing-site.md §10 — decisão explícita do Vinicius em 22/ago:
 * publicar completo, com selo discreto, em vez de esconder). Nunca remover
 * o selo sem confirmar que a feature foi entregue.
 */
const PLANOS = [
  {
    nome: 'Standard',
    preco: '99',
    destaque: false,
    itens: [
      { texto: 'Cardápio, carrinho e zonas', emBreve: false },
      { texto: 'PIX + pagar na entrega', emBreve: false },
      { texto: 'Gestor de pedidos + impressão', emBreve: false },
      { texto: 'Status por WhatsApp', emBreve: false },
    ],
  },
  {
    nome: 'Pro',
    preco: '189',
    destaque: true,
    itens: [
      { texto: 'Tudo do Standard', emBreve: false },
      { texto: 'Cartão online', emBreve: true },
      { texto: 'Cupons, promoções e combos', emBreve: true },
      { texto: 'Fidelidade', emBreve: true },
    ],
  },
  {
    nome: 'Premium',
    preco: '299',
    destaque: false,
    itens: [
      { texto: 'Tudo do Pro', emBreve: false },
      { texto: 'PDV + caixa', emBreve: true },
      { texto: 'Mesas, QR-code e garçom', emBreve: true },
      { texto: 'Integração com iFood', emBreve: true },
    ],
  },
];

export function Pricing() {
  return (
    <section id="planos" className="[background-color:var(--ink-900)] px-6 py-16 sm:px-10">
      <div className="mx-auto max-w-6xl text-center">
        <h2 className="[font-family:var(--font-display)] text-display uppercase text-cream">Preço do letreiro, sem letra miúda</h2>
        <p className="mt-3 font-mono text-caption uppercase tracking-wide text-cream/80">
          Reajuste só por IPCA · Cancela quando quiser · Sem taxa por venda
        </p>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {PLANOS.map((plano) => (
            <div
              key={plano.nome}
              className={`flex flex-col rounded-lg bg-cream-card p-8 text-left shadow-[8px_8px_0_var(--ink-900)] ${
                plano.destaque ? 'border-2 border-caution' : ''
              }`}
            >
              {plano.destaque ? (
                <span className="mb-3 inline-block w-fit rounded-pill bg-caution px-3 py-1 font-mono text-caption uppercase tracking-wide text-text">
                  Mais pedido
                </span>
              ) : null}

              <p className="font-mono text-caption uppercase tracking-wide text-brand-strong">{plano.nome}</p>
              <p className="tnum mt-2 [font-family:var(--font-display)] text-display text-text">
                R$ {plano.preco}
                <span className="text-body text-text-muted">/mês</span>
              </p>

              <ul className="mt-6 flex-1 space-y-3 text-body text-text">
                {plano.itens.map((item) => (
                  <li key={item.texto} className="flex items-center gap-2">
                    <span aria-hidden>•</span>
                    <span>{item.texto}</span>
                    {item.emBreve ? (
                      <span className="rounded-pill bg-border px-2 py-0.5 font-mono text-[11px] uppercase tracking-wide text-text-muted">
                        em breve
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>

              <LinkButton
                href={SIGNUP_URL}
                variant={plano.destaque ? 'primary' : 'outline'}
                className={`mt-8 w-full ${plano.destaque ? '' : 'text-brand-strong border-border-strong'}`}
              >
                Começar
              </LinkButton>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
