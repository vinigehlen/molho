/** Parafusos decorativos nos 4 cantos — assinatura do painel do hero. */
export function CornerBolts() {
  const positions = ['top-3 left-3', 'top-3 right-3', 'bottom-3 left-3', 'bottom-3 right-3'];
  return (
    <>
      {positions.map((pos) => (
        <span key={pos} aria-hidden className={`absolute ${pos} h-2.5 w-2.5 rounded-full bg-white/25`} />
      ))}
    </>
  );
}
