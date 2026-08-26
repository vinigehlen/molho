import Link from 'next/link';

export function Footer() {
  return (
    <footer className="[background-color:var(--ink-900)] px-6 py-10 text-cream sm:px-10">
      <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-[1.4fr_1fr_1fr]">
        <div>
          <p className="font-mono text-caption uppercase tracking-wide text-cream/80">
            Molho · o ingrediente que transforma
          </p>
          <p className="mt-3 max-w-md text-body text-cream/70">
            Cardápio digital, PIX e gestor de pedidos para restaurante vender direto, sem comissão por venda.
          </p>
        </div>

        <div>
          <p className="font-mono text-caption uppercase tracking-wide text-cream/70">Contato</p>
          <address className="mt-3 not-italic text-body text-cream/70">
            <a className="underline-offset-4 hover:underline" href="mailto:contato@molho.live">
              contato@molho.live
            </a>
            <br />
            Brasil
          </address>
        </div>

        <div>
          <p className="font-mono text-caption uppercase tracking-wide text-cream/70">Legal</p>
          <nav className="mt-3 flex flex-col gap-2 text-body text-cream/70">
            <Link className="underline-offset-4 hover:underline" href="/privacidade">
              Política de Privacidade
            </Link>
            <Link className="underline-offset-4 hover:underline" href="/termos">
              Termos de Uso
            </Link>
          </nav>
        </div>
      </div>

      <p className="mx-auto mt-8 max-w-6xl border-t border-cream/15 pt-6 font-mono text-caption text-cream/50">
        © 2026 Molho. Versões legais iniciais, sujeitas à revisão jurídica antes do go-live comercial.
      </p>
    </footer>
  );
}
