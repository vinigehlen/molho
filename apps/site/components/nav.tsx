import Image from 'next/image';
import Link from 'next/link';
import { LinkButton } from './link-button';
import { LOGIN_URL, SIGNUP_URL } from '../lib/urls';

export function Nav() {
  return (
    <nav className="sticky top-0 z-10 flex items-center justify-between gap-4 bg-cream px-6 py-4 sm:px-10">
      <Image src="/logo-molho.svg" alt="Molho" width={120} height={32} priority />

      <div className="hidden items-center gap-6 font-mono text-caption uppercase tracking-wide text-text-muted md:flex">
        <Link href="#produto" className="hover:text-text">
          Produto
        </Link>
        <Link href="#planos" className="hover:text-text">
          Planos
        </Link>
        <Link href={SIGNUP_URL} className="hover:text-text">
          Começar
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <LinkButton href={LOGIN_URL} variant="outline" size="sm" className="text-brand-strong border-border-strong">
          Entrar
        </LinkButton>
        <LinkButton href={SIGNUP_URL} variant="primary" size="sm">
          Testar grátis
        </LinkButton>
      </div>
    </nav>
  );
}
