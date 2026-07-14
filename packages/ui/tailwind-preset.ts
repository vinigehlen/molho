import type { Config } from 'tailwindcss';

/**
 * Preset Tempero — consumido por packages/ui e pelos dois fronts.
 *
 * Expõe APENAS tokens semânticos (doc de marca §4): um componente escreve
 * `bg-brand`, nunca `bg-[#820AD1]`. Os primitivos ficam em tokens.css e não
 * viram utilitário de propósito — é o que permite o white-label trocar o tema
 * em runtime sem rebuild, e o que a regra de lint do hex protege.
 */
const preset = {
  content: [],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: 'var(--brand)',
          strong: 'var(--brand-strong)',
          subtle: 'var(--brand-subtle)',
          faint: 'var(--brand-faint)',
          accent: 'var(--brand-accent)',
        },
        'on-brand': 'var(--on-brand)',
        // Branco também vem do token: `danger` e `pix` têm texto branco fixo, que
        // não acompanha o --on-brand do tema do lojista.
        white: 'var(--white)',
        text: {
          DEFAULT: 'var(--text)',
          muted: 'var(--text-muted)',
          disabled: 'var(--text-disabled)',
        },
        bg: {
          DEFAULT: 'var(--bg)',
          card: 'var(--bg-card)',
        },
        border: 'var(--border)',
        positive: 'var(--positive)',
        caution: 'var(--caution)',
        critical: 'var(--critical)',
        info: 'var(--info)',
        pix: 'var(--pix)',
        status: {
          received: 'var(--status-received)',
          preparing: 'var(--status-preparing)',
          ready: 'var(--status-ready)',
          'in-transit': 'var(--status-in-transit)',
          completed: 'var(--status-completed)',
          canceled: 'var(--status-canceled)',
        },
      },
      borderRadius: {
        sm: 'var(--r-sm)',
        md: 'var(--r-md)',
        lg: 'var(--r-lg)',
        xl: 'var(--r-xl)',
        pill: 'var(--r-pill)',
      },
      boxShadow: {
        1: 'var(--e-1)',
        2: 'var(--e-2)',
        3: 'var(--e-3)',
        focus: 'var(--focus-ring)',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Escala tipográfica do §3.3 — tamanho + linha + peso juntos.
        'display-lg': ['40px', { lineHeight: '44px', fontWeight: '800' }],
        display: ['32px', { lineHeight: '38px', fontWeight: '700' }],
        'title-lg': ['24px', { lineHeight: '30px', fontWeight: '700' }],
        title: ['20px', { lineHeight: '26px', fontWeight: '600' }],
        'body-lg': ['18px', { lineHeight: '28px', fontWeight: '400' }],
        body: ['16px', { lineHeight: '24px', fontWeight: '400' }],
        'body-strong': ['16px', { lineHeight: '24px', fontWeight: '600' }],
        caption: ['13px', { lineHeight: '18px', fontWeight: '400' }],
        overline: ['11px', { lineHeight: '16px', fontWeight: '600', letterSpacing: '0.08em' }],
      },
      spacing: {
        // Escala 4pt. `touch` é o alvo mínimo de toque (44px) — §6.1.
        1: 'var(--sp-1)',
        2: 'var(--sp-2)',
        3: 'var(--sp-3)',
        4: 'var(--sp-4)',
        5: 'var(--sp-5)',
        6: 'var(--sp-6)',
        8: 'var(--sp-8)',
        10: 'var(--sp-10)',
        12: 'var(--sp-12)',
        16: 'var(--sp-16)',
        touch: 'var(--touch-min)',
      },
      transitionTimingFunction: {
        out: 'var(--ease-out)',
        'in-out': 'var(--ease-in-out)',
      },
      transitionDuration: {
        fast: 'var(--t-fast)',
        base: 'var(--t-base)',
        slow: 'var(--t-slow)',
      },
      keyframes: {
        // Assinaturas de motion do §3.5.
        'sheet-in': {
          from: { transform: 'translateY(100%)' },
          '70%': { transform: 'translateY(-1%)' },
          to: { transform: 'translateY(0)' },
        },
        'pulse-dot': {
          '0%, 100%': { transform: 'scale(1)', opacity: '1' },
          '50%': { transform: 'scale(1.25)', opacity: '0.7' },
        },
        shimmer: {
          from: { backgroundPosition: '-200% 0' },
          to: { backgroundPosition: '200% 0' },
        },
        breathe: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.55' },
        },
      },
      animation: {
        'sheet-in': 'sheet-in var(--t-slow) var(--ease-out)',
        'pulse-dot': 'pulse-dot 1.2s var(--ease-in-out) infinite',
        shimmer: 'shimmer 1.2s linear infinite',
        breathe: 'breathe 1.6s var(--ease-in-out) infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;

export default preset;
