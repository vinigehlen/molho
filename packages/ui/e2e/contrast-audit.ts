/**
 * Auditoria de contraste executada DENTRO do navegador.
 *
 * Existe porque o teste de unidade e o axe não pegam a classe de bug que já nos
 * mordeu: o `cn()` engolia a classe de cor do texto e o botão primário herdava
 * ink — fonte correto, DOM íntegro, axe verde, pixel ilegível (1:1 no Grafite).
 * A única testemunha confiável é o pixel que o Chromium pinta.
 *
 * Por isso aqui NÃO se lê a cor declarada e pronto: compõe-se alfa e `opacity`
 * de toda a cadeia de ancestrais até o primeiro fundo opaco. Sem isso o estado
 * disabled (opacity 40%) seria medido como se fosse opaco — e é justamente ele
 * que costuma vazar contraste ruim.
 */

export interface Amostra {
  tipo: 'texto' | 'grafico';
  elemento: string;
  texto: string;
  desabilitado: boolean;
  frente: string;
  fundo: string;
  razao: number;
  minimo: number;
  passa: boolean;
}

export interface LimiaresContraste {
  /** Texto normal (WCAG 1.4.3 AA). */
  texto: number;
  /** Texto grande: >= 24px, ou >= 18.66px em negrito. */
  textoGrande: number;
  /** Bordas de campo, ícones e demais elementos gráficos (WCAG 1.4.11). */
  grafico: number;
  /**
   * Texto de componentes inativos. A WCAG 1.4.3 isenta componentes desabilitados,
   * mas nós NÃO isentamos: "desabilitado" não pode virar "invisível". Alcançável
   * porque o disabled do Tempero é um par de tokens, não `opacity: 40%`.
   */
  desabilitado: number;
}

/**
 * Roda no contexto da página (é serializada pelo Playwright): não pode fechar
 * sobre nada do módulo. Tudo que precisa vem por argumento.
 */
export function auditarContraste(limiares: LimiaresContraste): Amostra[] {
  type RGBA = [number, number, number, number];

  const parseCor = (valor: string): RGBA => {
    const n = valor.match(/[\d.]+/g)?.map(Number) ?? [];
    return [n[0] ?? 0, n[1] ?? 0, n[2] ?? 0, n[3] ?? 1];
  };

  const compor = (frente: RGBA, fundo: RGBA, alfa: number): RGBA => [
    frente[0] * alfa + fundo[0] * (1 - alfa),
    frente[1] * alfa + fundo[1] * (1 - alfa),
    frente[2] * alfa + fundo[2] * (1 - alfa),
    1,
  ];

  const luminancia = ([r, g, b]: RGBA): number => {
    const canal = (v: number) => {
      const c = v / 255;
      return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * canal(r) + 0.7152 * canal(g) + 0.0722 * canal(b);
  };

  const contraste = (a: RGBA, b: RGBA): number => {
    const [claro, escuro] = [luminancia(a), luminancia(b)].sort((x, y) => y - x) as [number, number];
    return (claro + 0.05) / (escuro + 0.05);
  };

  /** Opacidade acumulada do elemento e de todos os seus ancestrais. */
  const opacidadeAcumulada = (el: Element): number => {
    let opacidade = 1;
    for (let n: Element | null = el; n; n = n.parentElement) {
      opacidade *= Number(getComputedStyle(n).opacity);
    }
    return opacidade;
  };

  /**
   * Fundo efetivo: empilha do <html> até o elemento, compondo cada camada com
   * seu alfa multiplicado pela opacidade acumulada daquele nó.
   */
  const fundoEfetivo = (el: Element): RGBA => {
    const cadeia: Element[] = [];
    for (let n: Element | null = el; n; n = n.parentElement) cadeia.unshift(n);

    let resultado: RGBA = [255, 255, 255, 1]; // a página nasce branca
    for (const n of cadeia) {
      const cor = parseCor(getComputedStyle(n).backgroundColor);
      const alfa = cor[3] * opacidadeAcumulada(n);
      if (alfa > 0) resultado = compor(cor, resultado, alfa);
    }
    return resultado;
  };

  const estaDesabilitado = (el: Element): boolean =>
    Boolean(el.closest('[disabled], [aria-disabled="true"]'));

  const descrever = (el: Element): string => {
    const tag = el.tagName.toLowerCase();
    const classe = (el.getAttribute('class') ?? '').split(/\s+/).slice(0, 2).join('.');
    return classe ? `${tag}.${classe}` : tag;
  };

  // Varre o <body> inteiro, e não só o #storybook-root: MoSheet e toasts vivem
  // em portal, fora da árvore do Storybook. Medindo só a raiz, o sheet — que é
  // onde o cliente escolhe o prato — escaparia do portão.
  const raiz = document.body;
  if (!raiz) return [];

  const amostras: Amostra[] = [];

  for (const el of Array.from(raiz.querySelectorAll('*'))) {
    const estilo = getComputedStyle(el);
    const caixa = el.getBoundingClientRect();

    // Fora da tela, escondido, ou sr-only (1px): não é pixel que alguém lê.
    if (estilo.display === 'none' || estilo.visibility === 'hidden') continue;
    if (caixa.width < 2 || caixa.height < 2) continue;

    const fundo = fundoEfetivo(el);
    const opacidade = opacidadeAcumulada(el);
    const desabilitado = estaDesabilitado(el);

    // ── Texto ────────────────────────────────────────────────────────────────
    const textoProprio = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() ?? '')
      .join(' ')
      .trim();

    if (textoProprio) {
      const cor = parseCor(estilo.color);
      const frente = compor(cor, fundo, cor[3] * opacidade);

      const px = parseFloat(estilo.fontSize);
      const peso = Number(estilo.fontWeight) || 400;
      const grande = px >= 24 || (px >= 18.66 && peso >= 700);

      const minimo = desabilitado
        ? limiares.desabilitado
        : grande
          ? limiares.textoGrande
          : limiares.texto;

      const razao = contraste(frente, fundo);
      amostras.push({
        tipo: 'texto',
        elemento: descrever(el),
        texto: textoProprio.slice(0, 40),
        desabilitado,
        frente: `rgb(${frente.slice(0, 3).map(Math.round).join(', ')})`,
        fundo: `rgb(${fundo.slice(0, 3).map(Math.round).join(', ')})`,
        razao: Number(razao.toFixed(2)),
        minimo,
        passa: razao >= minimo,
      });
    }

    // ── Gráfico: borda de CAMPO de formulário ────────────────────────────────
    // Só campo. Num input vazio a borda é a única pista visual de que ali se
    // digita, então ela carrega informação (WCAG 1.4.11). A borda de um card ou
    // de um divisor é decorativa — o conteúdo já identifica o componente — e
    // exigir 3:1 dela transformaria o design system inteiro em caixa cinza.
    const ehCampo = el.matches('input, select, textarea');
    const larguraBorda = parseFloat(estilo.borderTopWidth);

    if (ehCampo && larguraBorda > 0) {
      const cor = parseCor(estilo.borderTopColor);
      const alfa = cor[3] * opacidade;

      if (alfa > 0.05) {
        // A borda é lida contra o que está ATRÁS do elemento, não contra o
        // próprio fundo dele.
        const atras = el.parentElement
          ? fundoEfetivo(el.parentElement)
          : ([255, 255, 255, 1] as RGBA);
        const frente = compor(cor, atras, alfa);
        // Elemento gráfico mantém o piso de 3:1 mesmo desabilitado.
        const minimo = limiares.grafico;
        const razao = contraste(frente, atras);

        amostras.push({
          tipo: 'grafico',
          elemento: `${descrever(el)} (borda)`,
          texto: '',
          desabilitado,
          frente: `rgb(${frente.slice(0, 3).map(Math.round).join(', ')})`,
          fundo: `rgb(${atras.slice(0, 3).map(Math.round).join(', ')})`,
          razao: Number(razao.toFixed(2)),
          minimo,
          passa: razao >= minimo,
        });
      }
    }

    // ── Gráfico: ícones SVG que carregam significado ──────────────────────────
    // aria-hidden = decorativo (o texto ao lado já informa) → não é requisito.
    if (el.tagName.toLowerCase() === 'svg' && el.getAttribute('aria-hidden') !== 'true') {
      const cor = parseCor(estilo.color);
      const frente = compor(cor, fundo, cor[3] * opacidade);
      const minimo = limiares.grafico;
      const razao = contraste(frente, fundo);

      amostras.push({
        tipo: 'grafico',
        elemento: `${descrever(el)} (ícone)`,
        texto: '',
        desabilitado,
        frente: `rgb(${frente.slice(0, 3).map(Math.round).join(', ')})`,
        fundo: `rgb(${fundo.slice(0, 3).map(Math.round).join(', ')})`,
        razao: Number(razao.toFixed(2)),
        minimo,
        passa: razao >= minimo,
      });
    }
  }

  return amostras;
}
