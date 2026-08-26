const FEATURES = [
  {
    titulo: 'Fotos e variações',
    desc: 'Item com foto, complemento e o "esgotou" desligando a venda na hora.',
  },
  {
    titulo: 'PIX na tela',
    desc: 'QR e código copia-e-cola; você confirma quando o extrato bater.',
  },
  {
    titulo: 'Zonas de entrega',
    desc: 'Você desenha a área no mapa; fora dela, o checkout já avisa e oferece retirada.',
  },
  {
    titulo: 'Comanda impressa',
    desc: 'Sai sozinha na impressora ESC/POS da cozinha — sem reescrever nada.',
  },
  {
    titulo: 'Gestor de pedidos',
    desc: 'Som e push a cada pedido novo, fila offline se a internet cair — nada se perde entre o salão e a cozinha.',
  },
  {
    titulo: 'Status no WhatsApp',
    desc: 'Um toque, mensagem pronta, pelo seu número de sempre — o cliente sabe que o pedido saiu sem você digitar nada.',
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <h2 className="[font-family:var(--font-display)] text-display uppercase text-brand-strong">O que vem no seu cardápio digital</h2>
      <p className="mt-3 max-w-2xl text-body-lg text-text-muted">
        Só o essencial pra dar conta de uma sexta-feira de pico sem anotar pedido no WhatsApp.
      </p>

      <div className="mt-10 grid gap-8 sm:grid-cols-2">
        {FEATURES.map((f) => (
          <div key={f.titulo}>
            <h3 className="text-title font-semibold text-text">{f.titulo}</h3>
            <p className="mt-2 text-body text-text-muted">{f.desc}</p>
            <span className="mt-3 inline-block font-mono text-caption uppercase tracking-wide text-brand-strong">
              essencial
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}
