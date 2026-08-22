const ITENS = [
  { nome: 'X-Salada especial', desc: 'pão, carne, queijo, salada', preco: '32,00' },
  { nome: 'Batata rústica G', desc: '+ cheddar e bacon', preco: '28,00' },
  { nome: 'Combo família', desc: '4 lanches + 2 refris', preco: '96,00' },
];

export function MenuCard() {
  return (
    <div className="relative rounded-lg border-2 [border-color:var(--ink-900)] bg-cream-card p-6 shadow-[8px_8px_0_var(--ink-900)]">
      <p className="mb-4 font-mono text-caption uppercase tracking-wide text-brand-strong">Hoje na casa</p>
      <ul className="divide-y divide-dashed divide-border-strong">
        {ITENS.map((item) => (
          <li key={item.nome} className="flex items-start justify-between gap-4 py-4 first:pt-0 last:pb-0">
            <div>
              <p className="text-body-strong text-text">{item.nome}</p>
              <p className="font-mono text-caption text-text-muted">{item.desc}</p>
            </div>
            <p className="tnum font-mono text-body-strong text-brand-strong">{item.preco}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}
