import type { AdminOrder } from '@molho/contracts';
import { centsToBRL } from './format';

/**
 * Click-to-chat (Épico 11, CLAUDE.md regra 6): o Molho NUNCA envia mensagem.
 * Ele monta o texto e abre o `wa.me` pro lojista tocar em enviar, pelo número
 * normal dele. Nada de Cloud API, nada de Baileys — e nada de
 * `ClickToChatProvider` como porta: uma URL montada na UI não justifica uma
 * abstração com uma implementação só.
 *
 * Templates ESPELHADOS de packages/contracts/src/copy.pt-BR.ts (COPY.whatsapp)
 * — o gestor é `'use client'` e importar VALOR de @molho/contracts no bundle
 * do cliente quebra em runtime (boilerplate de Fast Refresh no CJS compilado;
 * mesmo motivo de BOARD_COLUMNS em orders-api.ts e de tenant-menu.tsx no
 * storefront). O `import type` acima é apagado no build. A fonte da verdade
 * da microcopy continua em contracts (é lá que o teste de léxico varre); se
 * uma mudar, a outra acompanha.
 */
const CONFIRMADO = 'Oi, {nome}! Confirmei seu pedido: {resumo}. Total {total}. Já entrou pra praça.';
const PRONTO_RETIRADA = 'Oi, {nome}! Seu pedido tá pronto pra retirada: {resumo}. Total {total}. É só passar aqui.';
const SAIU_ENTREGA = 'Oi, {nome}! Seu pedido saiu pra entrega: {resumo}. Total {total}. Já já chega aí.';

/**
 * Status ATUAL do pedido → mensagem. Cobre as 4 colunas do board; terminais
 * não têm template (nem aparecem no board) e caem em `null`.
 *
 * De propósito olha o status atual e não a transição que acabou de acontecer:
 * o lojista toca "Saiu p/ entrega", o card re-renderiza em `in_transit`, e aí
 * ele toca "Avisar cliente" — o botão nunca precisa lembrar do que veio antes.
 *
 * DOIS mapas, não um — `ready` significa coisas diferentes por
 * `fulfillmentType` (retirada no balcão): pra pickup é "vem buscar", pra
 * delivery é só "ainda preparando, vai sair já". Conflar os dois mandaria
 * "pronto pra retirada" pro cliente de um pedido de ENTREGA.
 */
const TEMPLATE_DELIVERY: Partial<Record<AdminOrder['status'], string>> = {
  received: CONFIRMADO,
  preparing: CONFIRMADO,
  ready: CONFIRMADO,
  in_transit: SAIU_ENTREGA,
};
const TEMPLATE_PICKUP: Partial<Record<AdminOrder['status'], string>> = {
  received: CONFIRMADO,
  preparing: CONFIRMADO,
  ready: PRONTO_RETIRADA,
  // in_transit não é o caminho normal de pickup (o cliente busca a partir de
  // `ready`), mas a máquina de estados é a MESMA pros dois tipos (CLAUDE.md
  // regra 12) — se o lojista avançar mesmo assim, ainda tem mensagem, não `null`.
  in_transit: PRONTO_RETIRADA,
};

/** "2× X-Salada, 1× Coca" — o mesmo resumo que o card já mostra. */
export function orderSummary(order: AdminOrder): string {
  return order.items.map((item) => `${item.quantity}× ${item.name}`).join(', ');
}

/** Texto inicial do sheet (o lojista edita antes de enviar). `null` = status sem mensagem pronta. */
export function whatsappMessage(order: AdminOrder): string | null {
  const template = (order.fulfillmentType === 'pickup' ? TEMPLATE_PICKUP : TEMPLATE_DELIVERY)[order.status];
  if (!template) return null;
  const vars: Record<string, string> = {
    nome: order.customerName,
    resumo: orderSummary(order),
    total: centsToBRL(order.totalCents),
  };
  return template.replace(/\{(\w+)\}/g, (bruto, chave: string) => vars[chave] ?? bruto);
}

/**
 * `phone` chega do endpoint já em dígitos com DDI e sem "+" (é o servidor que
 * decifra e normaliza). `encodeURIComponent` no texto porque ele é editável:
 * qualquer `&`, `#` ou quebra de linha que o lojista digitar tem que
 * sobreviver à query string.
 */
export function waMeUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}
