/**
 * Fita listrada diagonal vermelho/branco, full-bleed, no topo da página.
 * `repeating-linear-gradient` não tem utilitário Tailwind pronto — inline
 * style referenciando os tokens (--brand/--white), não hex solto.
 */
export function StripeTape() {
  return (
    <div
      aria-hidden
      className="h-2 w-full"
      style={{
        backgroundImage:
          'repeating-linear-gradient(-45deg, var(--brand) 0 12px, var(--white) 12px 24px)',
      }}
    />
  );
}
