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
    // ⚠️ TEXTO PENDENTE — brief (docs/13-landing-site.md §5) cortou este
    // texto no print original e proibiu inventar o final. Aguardando
    // Vinicius colar o texto verbatim antes de publicar esta seção.
    desc: 'Som e push a cada pedido novo, fila offline se a internet… [AGUARDANDO TEXTO ORIGINAL]',
  },
  {
    titulo: 'Status no WhatsApp',
    // ⚠️ TEXTO PENDENTE — mesmo motivo do item acima.
    desc: 'Um toque, mensagem pronta, pelo seu número de… [AGUARDANDO TEXTO ORIGINAL]',
  },
];

export function Features() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16 sm:px-10">
      <h2 className="[font-family:var(--font-display)] text-display uppercase text-brand-strong">O que entra no cardápio digital</h2>
      <p className="mt-3 max-w-2xl text-body-lg text-text-muted">
        Só o essencial pra rodar uma sexta-feira de pico sem depender do letreiro da fachada.
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
