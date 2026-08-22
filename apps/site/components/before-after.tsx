export function BeforeAfter() {
  return (
    <section className="bg-brasa-deep px-6 py-14 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 md:flex-row md:gap-6">
        <div className="flex-1 text-center md:text-right">
          <p className="font-mono text-caption uppercase tracking-wide text-caution">O letreiro na fachada</p>
          <p className="mt-3 text-body-lg text-on-brand">
            Preço bom, mas quem não passa na rua não vê — e trocar a letrinha é subir na escada.
          </p>
        </div>

        <span aria-hidden className="rotate-90 text-2xl text-caution md:rotate-0">
          →
        </span>

        <div className="flex-1 text-center md:text-left">
          <p className="font-mono text-caption uppercase tracking-wide text-caution">O cardápio no Molho</p>
          <p className="mt-3 text-body-lg text-on-brand">
            Mesmo prato, mesma casa — só que agora com pedido, entrega e PIX embutidos.
          </p>
        </div>
      </div>
    </section>
  );
}
