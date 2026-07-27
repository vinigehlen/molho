/** Centavos (inteiro, CLAUDE.md regra 4) → "R$ 12,34". Nunca float — divide só na exibição. */
export function centsToBRL(cents: number): string {
  return (cents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

/** ISO → "18:42" (horário local) — o gestor pensa em "que horas entrou o pedido". */
export function isoToTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
