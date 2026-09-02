/**
 * Microcopy do Molho — pt-BR.
 *
 * Fonte da verdade: docs/04-brand-design-system.md §2 (identidade verbal).
 * Esta é a voz do produto. Não invente string na tela: se falta uma, ela nasce
 * aqui, passa pelo léxico, e aí sim vai para o componente.
 *
 * As 4 regras do tom (§2.1):
 *   1. Fala como gente, não como sistema. "Pedido novo na área!", nunca
 *      "Nova transação registrada".
 *   2. Direto ao ponto. Frase curta. Verbo primeiro. Uma ideia por frase.
 *   3. Do balcão, não do escritório: comanda, praça, casa, salão, despacho.
 *   4. Celebra o lojista. A conquista é dele: "Você bateu seu recorde",
 *      nunca "O Molho aumentou suas vendas".
 *
 * Regras de escrita (§2.4):
 *   · Sempre "você", informal. Nada de gerundismo ("vamos estar enviando").
 *   · Nenhum emoji, em mensagem nenhuma (CLAUDE.md, sem exceção) — ícone vem
 *     da biblioteca de ícones do design system.
 *   · Nunca prometa: "entrega em 30 min garantidos" → "previsão: 30–40 min".
 *
 * Léxico (§2.2) — o que NÃO escrever:
 *   "a plataforma"/"o sistema" → "seu delivery", "sua casa"
 *   "transação"/"ordem"        → "pedido"
 *   "logar"/"efetuar login"    → "entrar no Molho"
 *   "dine-in"                  → "salão"
 *   "usuário final"            → "cliente"
 *   "o lojista"/"o parceiro"   → "você" (em UI)
 */

/** Interpola {chaves} numa string de copy: t(COPY.storefront.saudacao, { nome: 'Ana' }) */
export function t(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (bruto, chave: string) =>
    chave in vars ? String(vars[chave]) : bruto,
  );
}

export const COPY = {
  /** O que o CLIENTE lê — storefront, checkout, acompanhamento. */
  storefront: {
    /** Vars: {nome} */
    saudacao: 'Oi, {nome}! Bateu a fome?',
    saudacaoAnonima: 'Bateu a fome?',

    /** Loja existe (link válido) mas ainda não tem categoria/produto visível. */
    cardapioVazioTitulo: 'Essa loja ainda tá montando o cardápio',
    cardapioVazioCorpo: 'Volta em instantes — já já tem prato novo por aqui.',

    carrinhoVazioTitulo: 'Seu carrinho tá vazio',
    carrinhoVazioCorpo: 'Bora resolver isso?',
    carrinhoVazioAcao: 'Ver o cardápio',

    /** A tela de PIX. Sem emoji perto de dinheiro (§2.4). */
    pixAguardando: 'Só falta o PIX. Cola o código no app do seu banco e pronto.',
    pixCopiar: 'Copiar código PIX',
    pixCopiado: 'Código copiado. Agora é só colar no seu banco.',

    pedidoConfirmado: 'Pedido na cozinha! A gente te avisa a cada passo.',
    acompanhamento: {
      titulo: 'Acompanhe seu pedido',
      subtitulo: 'Atualizamos esta página enquanto a casa toca a comanda.',
      atualizar: 'Atualizar agora',
      atualizadoAs: 'Atualizado às {hora}',
      terminal: 'Esse pedido já chegou ao fim.',
      cancelado: 'A casa cancelou este pedido.',
      entregaAte: 'Entrega prevista até {hora}',
      retiradaAte: 'Retirada prevista até {hora}',
      itens: 'Itens do pedido',
    },

    /** Vars: {horario} */
    lojaFechada: 'A cozinha tá descansando. Voltamos {horario}. Dá pra olhar o cardápio e já escolher!',
    foraDaArea: 'Ainda não chegamos aí. Mas dá pra retirar no balcão!',

    /** Vars: {valor} — pedido mínimo não atingido. */
    pedidoMinimo: 'Faltam {valor} pra fechar o pedido mínimo da casa.',

    itemEsgotado: 'Esgotado',
    /** Previsão, nunca promessa (§2.4). */
    previsaoEntrega: 'Previsão: {minimo}–{maximo} min',
  },

  /** O que VOCÊ (o dono do restaurante) lê — backoffice, gestor, caixa. */
  backoffice: {
    produtosVazioTitulo: 'Nenhum prato por aqui ainda',
    produtosVazioCorpo: 'Que tal cadastrar o carro-chefe da casa?',
    produtosVazioAcao: 'Cadastrar produto',

    pedidosVazioTitulo: 'Nenhum pedido hoje ainda',
    pedidosVazioCorpo: 'Assim que cair o primeiro, ele aparece aqui e o som toca.',

    pedidoNovo: 'Pedido novo na área!',
    caixaFechado: 'Caixa fechado no capricho. Bom descanso!',

    /** A conquista é do lojista, nunca do Molho (§2.1, regra 4). */
    recordeDeVendas: 'Você bateu seu recorde de vendas!',
    primeiroPedidoDoDia: 'Primeiro pedido do dia. Vamo que vamo!',

    semConexao: 'Sem conexão — tentando reconectar. Seus pedidos estão salvos aqui.',
  },

  /**
   * Click-to-chat (Épico 11): o que VOCÊ manda pro cliente no WhatsApp, pelo
   * seu número normal. Não é o produto falando — é você, então a voz é a sua,
   * na primeira pessoa. Sempre EDITÁVEL antes de enviar: isto é ponto de
   * partida, não texto travado.
   *
   * Sem emoji de propósito: toda mensagem carrega valor em dinheiro (§2.4).
   * Vars: {nome} {resumo} {total}
   */
  whatsapp: {
    confirmado: 'Oi, {nome}! Confirmei seu pedido: {resumo}. Total {total}. Já entrou pra praça.',
    prontoRetirada: 'Oi, {nome}! Seu pedido tá pronto pra retirada: {resumo}. Total {total}. É só passar aqui.',
    saiuEntrega: 'Oi, {nome}! Seu pedido saiu pra entrega: {resumo}. Total {total}. Já já chega aí.',
  },

  /**
   * Comanda de cozinha (fallback universal do Épico 10, docs/02 §6 — o
   * "Imprimir" que abre o diálogo do navegador, antes do ESC/POS de verdade).
   * Sem preço nem telefone/endereço — a cozinha só precisa do que vai no
   * prato, não de dinheiro nem de PII (docs/02 §6, requisito do fallback).
   */
  comanda: {
    pedidoNumero: 'Pedido #{numero}',
    entrega: 'Entrega',
    retirada: 'Retirada no balcão',
  },

  /** Usada enquanto uma área do produto ainda não existe (scaffold dos apps). */
  sistema: {
    /** Vars: {epico} */
    emConstrucao: 'Essa área chega no Épico {epico}.',
  },

  /** Erros. Nunca com emoji, nunca culpando o cliente (§2.4). */
  erros: {
    generico: 'Ops, algo queimou aqui do nosso lado. Já estamos apagando o fogo — tenta de novo em instantes.',
    semRede: 'Você está sem internet. Assim que voltar, a gente continua daqui.',
    naoEncontrado: 'Não achamos essa página. Que tal voltar pro cardápio?',
    semPermissao: 'Esse cantinho é restrito. Fala com o dono da casa pra liberar.',
  },
} as const;

export type Copy = typeof COPY;
