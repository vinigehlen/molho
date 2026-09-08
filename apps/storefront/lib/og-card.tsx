/* eslint-disable no-restricted-syntax -- Satori (next/og) não conhece Tailwind:
   o card OG é renderizado por um motor próprio a partir de estilos inline, então
   branco/preto/rgba precisam ser literais aqui. Mesmo caso do Route Handler do
   manifest PWA. As cores da MARCA continuam vindo do token (`theme.brand`,
   `theme.brandAccent`), nunca hardcoded. */
import { ImageResponse } from 'next/og';
import { getTheme } from '@molho/ui';

export const OG_SIZE = { width: 1200, height: 630 } as const;
export const OG_CONTENT_TYPE = 'image/png';

interface OgCardInput {
  /** Nome da loja (ou "Molho" no card raiz). */
  name: string;
  /** Uma linha embaixo do nome — descrição do lojista, endereço, ou tagline. */
  tagline: string | null;
  /** Template de cor da loja; ausente/desconhecido cai em Brasa. */
  themeKey?: string | null;
  /** Foto de capa (a "fachada"). Sem ela, o card é a cor sólida do tema. */
  coverImageUrl?: string | null;
  /** Logo do lojista — vira o badge circular no canto. */
  logoImageUrl?: string | null;
}

/**
 * Card de compartilhamento do storefront — o que aparece quando o lojista
 * manda o link no WhatsApp. Formato "perfil de rede social": capa de fundo,
 * logo num badge, nome grande, uma linha de contexto, faixa na cor da loja.
 *
 * Substitui o PNG estático `og-image-1200x630.png`, que ficou preso na arte
 * roxa `#820AD1` pré-rebrand. Sem capa/logo, degrada pra um card sólido na
 * cor do tema (Brasa por padrão) — nunca mais roxo, nunca mais genérico.
 */
export function renderOgCard({ name, tagline, themeKey, coverImageUrl, logoImageUrl }: OgCardInput): ImageResponse {
  const theme = getTheme(themeKey);

  return new ImageResponse(
    (
      <div
        style={{
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'flex-end',
          width: '100%',
          height: '100%',
          backgroundColor: theme.brand,
          fontFamily: 'sans-serif',
        }}
      >
        {coverImageUrl ? (
          <img
            src={coverImageUrl}
            alt=""
            width={OG_SIZE.width}
            height={OG_SIZE.height}
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : null}

        {/* Véu escuro pra garantir contraste AA do texto branco sobre qualquer capa. */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            background: 'linear-gradient(180deg, rgba(0,0,0,0.15) 0%, rgba(0,0,0,0.35) 45%, rgba(0,0,0,0.78) 100%)',
          }}
        />

        {/* Marca d'água de procedência — é do Molho. */}
        <div
          style={{
            position: 'absolute',
            top: 44,
            right: 56,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
            color: '#FFFFFF',
            fontSize: 28,
            fontWeight: 700,
            opacity: 0.92,
          }}
        >
          <div style={{ display: 'flex', width: 18, height: 18, borderRadius: 9999, backgroundColor: theme.brandAccent }} />
          molho
        </div>

        {/* Bloco da "fachada". */}
        <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', gap: 22, padding: '0 64px 72px' }}>
          {logoImageUrl ? (
            <img
              src={logoImageUrl}
              alt=""
              width={132}
              height={132}
              style={{
                width: 132,
                height: 132,
                borderRadius: 9999,
                objectFit: 'cover',
                border: '5px solid #FFFFFF',
                backgroundColor: '#FFFFFF',
              }}
            />
          ) : null}
          <div
            style={{
              display: 'flex',
              fontSize: 76,
              fontWeight: 800,
              color: '#FFFFFF',
              lineHeight: 1.05,
              letterSpacing: -1,
            }}
          >
            {name}
          </div>
          {tagline ? (
            <div
              style={{
                display: 'flex',
                fontSize: 32,
                color: 'rgba(255,255,255,0.86)',
                lineHeight: 1.3,
                maxWidth: 980,
              }}
            >
              {tagline}
            </div>
          ) : null}
        </div>

        {/* Faixa da cor da loja no rodapé. */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, display: 'flex', height: 12, backgroundColor: theme.brandAccent }} />
      </div>
    ),
    OG_SIZE,
  );
}
