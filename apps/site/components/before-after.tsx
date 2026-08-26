export function BeforeAfter() {
  return (
    <section className="bg-brasa-deep px-6 py-14 sm:px-10">
      <div className="mx-auto flex max-w-5xl flex-col items-center gap-8 md:flex-row md:items-start md:gap-6">
        <div className="flex-1 text-center md:text-right">
          <p className="font-mono text-caption uppercase tracking-wide text-caution">Hoje, no WhatsApp</p>
          <p className="mt-3 text-body-lg text-on-brand">
            Cliente manda mensagem, o atendente escreve o pedido à mão, sem fila visível. No rush
            é fácil errar ou esquecer.
          </p>
        </div>

        <span aria-hidden className="mt-2 rotate-90 text-2xl text-caution md:mt-1 md:rotate-0">
          →
        </span>

        <div className="flex-1 text-center md:text-left">
          <p className="font-mono text-caption uppercase tracking-wide text-caution">Com o Molho</p>
          <p className="mt-3 text-body-lg text-on-brand">
            Cliente pede pelo cardápio, você recebe pronto na tela, com som, fila organizada e PIX
            já certo.
          </p>
        </div>
      </div>
    </section>
  );
}
