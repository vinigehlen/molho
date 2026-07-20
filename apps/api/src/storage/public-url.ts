/**
 * Resolve `Product.imageKey` (chave do objeto no R2) para a URL pública que o
 * front renderiza.
 *
 * Mora no servidor de propósito: o front NUNCA monta URL de bucket. Assim,
 * trocar "R2 público direto" por domínio próprio (`cdn.molho.store`, Fase 2)
 * ou por um Worker de resize é mudança de `S3_PUBLIC_URL`, sem deploy de
 * front e sem migration — o `imageKey` gravado no banco continua o mesmo.
 *
 * Devolve `null` quando não há chave OU quando `S3_PUBLIC_URL` está vazia
 * (leitura pública ainda não configurada no bucket). Nulo é um estado
 * legítimo do contrato: o card do produto cai no placeholder do tema em vez
 * de renderizar uma imagem quebrada.
 */
export function resolvePublicImageUrl(imageKey: string | null, publicBaseUrl: string | undefined): string | null {
  if (!imageKey) return null;

  const base = publicBaseUrl?.trim();
  if (!base) return null;

  // Normaliza a junta: base com ou sem "/" no fim, chave com ou sem "/" no
  // início, sempre produzem exatamente uma barra entre os dois.
  return `${base.replace(/\/+$/, '')}/${imageKey.replace(/^\/+/, '')}`;
}
