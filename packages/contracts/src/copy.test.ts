import { describe, expect, it } from 'vitest';
import { COPY, t } from './copy.pt-BR';

/** Achata o COPY em pares [caminho, texto] para varrer tudo de uma vez. */
function todasAsStrings(obj: object, prefixo = ''): [string, string][] {
  return Object.entries(obj).flatMap(([chave, valor]) => {
    const caminho = prefixo ? `${prefixo}.${chave}` : chave;
    if (typeof valor === 'string') return [[caminho, valor] as [string, string]];
    if (typeof valor === 'object' && valor !== null) return todasAsStrings(valor, caminho);
    return [];
  });
}

const STRINGS = todasAsStrings(COPY);
const ERROS = todasAsStrings(COPY.erros);

// Emoji: a faixa que importa aqui (pictogramas, símbolos, emoticons).
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu;

describe('interpolação', () => {
  it('troca as chaves pelos valores', () => {
    expect(t(COPY.storefront.saudacao, { nome: 'Ana' })).toBe('Oi, Ana 👋 Bateu a fome?');
    expect(t(COPY.storefront.lojaFechada, { horario: 'terça às 18h' })).toContain('terça às 18h');
  });

  it('deixa a chave crua quando falta o valor — some silencioso é pior', () => {
    expect(t('Oi, {nome}!')).toBe('Oi, {nome}!');
  });
});

/**
 * O léxico da marca (§2.2) vira teste. Sem isto, "o sistema" e "usuário final"
 * entram na UI na primeira sexta-feira corrida e nunca mais saem.
 */
describe('léxico da marca', () => {
  const PROIBIDO = [
    'a plataforma',
    'o sistema',
    'transação',
    'usuário final',
    'efetuar login',
    'logar',
    'dine-in',
    'o lojista',
    'consumidor',
    'operação concluída',
  ];

  it.each(STRINGS)('%s não usa palavra de fora do léxico', (_caminho, texto) => {
    const minuscula = texto.toLowerCase();
    const achado = PROIBIDO.find((termo) => minuscula.includes(termo));

    expect(achado, `"${texto}" usa "${achado}" — ver o léxico em §2.2`).toBeUndefined();
  });

  it.each(STRINGS)('%s não tem gerundismo', (_caminho, texto) => {
    expect(texto).not.toMatch(/vamos estar \w+ndo/i);
  });
});

describe('regras de escrita (§2.4)', () => {
  it.each(STRINGS)('%s usa no máximo 1 emoji', (_caminho, texto) => {
    expect(texto.match(EMOJI)?.length ?? 0).toBeLessThanOrEqual(1);
  });

  // Erro com emoji é deboche com quem já está frustrado.
  it.each(ERROS)('o erro %s não tem emoji nenhum', (_caminho, texto) => {
    expect(texto.match(EMOJI)).toBeNull();
  });

  it('a tela de PIX não brinca perto de dinheiro', () => {
    expect(COPY.storefront.pixAguardando.match(EMOJI)).toBeNull();
    expect(COPY.storefront.pixCopiado.match(EMOJI)).toBeNull();
  });

  // §2.4: "nunca prometer". A previsão é faixa, não garantia.
  it('a entrega é previsão, não promessa', () => {
    expect(COPY.storefront.previsaoEntrega).toContain('Previsão');
    expect(COPY.storefront.previsaoEntrega.toLowerCase()).not.toContain('garant');
  });
});
