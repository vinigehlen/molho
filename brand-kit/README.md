# Molho — Kit oficial da marca
**Conceito aprovado: "Pingo no O"** — o anel do "o" de molho com um pingo caindo. Monograma geométrico, linguagem fintech.

## Conceito
O símbolo é o **"o" de molho** transformado em monograma: um anel espesso e perfeitamente circular (geometria confiável, de banco digital) com um **pingo** caindo — o ingrediente que transforma, em movimento. Lê-se como letra, ícone e gota ao mesmo tempo.

## Estrutura do kit
| Pasta | Conteúdo | Onde usar |
|---|---|---|
| `01-lockup-horizontal/` | cor · mono (vermelho Brasa) · branco · preto (SVG + PNG) | **Aplicação principal**: site, e-mail, docs, assinatura, apresentações |
| `02-lockup-vertical/` | cor · branco · preto | Formatos quadrados, embalagem, splash, QR de mesa |
| `03-simbolo/` | cor · branco · preto · **compacto** | Isolado. A versão *compacta* (anel mais grosso, pingo maior) é obrigatória abaixo de 24px |
| `04-wordmark/` | ink · cor · branco | Quando o símbolo já aparece no contexto (ex.: header do app) |
| `05-app/` | app-icon (cor/dark/claro), **maskable**, avatar WhatsApp · PNG 1024/512/192/180 | Lojas, PWA manifest, avatar do robô |
| `06-favicon/` | favicon.svg, tile, branco · PNG 16/32/48 | `<link rel="icon">` |
| `07-social/` | og-image 1200×630 (SVG + PNG) | Open Graph, WhatsApp link preview, LinkedIn |
| `08-impressos/` | cartão de QR de mesa | Gráfica — substituir o placeholder pelo QR real do tenant |
| `09-motion/` | loader-pingo.svg (animado, SVG SMIL) | Loading do app: o pingo cai em loop 1,4s |
| `10-diagramas/` | área de proteção | Referência para designers e parceiros |

## Regras de uso
1. **Fundo claro** → lockup cor (símbolo #D63A1E + texto #141216). **Fundo vermelho/escuro** → versão branca. Nunca vermelho sobre vermelho.
2. **Área de proteção:** altura do "o" da wordmark em todos os lados (ver `10-diagramas/`).
3. **Tamanhos mínimos:** lockup horizontal 80px de largura · símbolo 24px · abaixo disso, símbolo compacto.
4. **Impressão 1 cor / fiscal / carimbo** → mono preto.
5. **Nunca:** rotacionar, esticar, aplicar gradiente/sombra/contorno, recolorir fora da paleta, separar o pingo do anel, colocar sobre foto sem overlay vermelho 40%.
6. **White-label:** o logo do Molho **não** é substituído por tenant. O restaurante usa o próprio logo no storefront; o Molho assina discretamente no rodapé ("feito com Molho").

## Snippets

**HTML head**
```html
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="icon" href="/favicon-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/app-icon-180.png">
<meta property="og:image" content="/og-image-1200x630.png">
<meta name="theme-color" content="#D63A1E">
```

**PWA manifest**
```json
{
  "name": "Molho",
  "short_name": "Molho",
  "theme_color": "#D63A1E",
  "background_color": "#FFFFFF",
  "icons": [
    { "src": "/app-icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/app-icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/app-icon-maskable-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
```

**Componente React (packages/ui)**
```tsx
export const MoLogo = ({ variant = "cor", size = 32 }: Props) => (/* importa o SVG correspondente */);
```
