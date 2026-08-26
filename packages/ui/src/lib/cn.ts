import { type ClassValue, clsx } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

/**
 * A escala tipográfica do Tempero (text-body-strong, text-title, text-caption…)
 * precisa ser DECLARADA para o tailwind-merge.
 *
 * Sem isto ele não reconhece esses nomes como tamanho de fonte, assume que são
 * COR e, ao encontrar `text-on-brand` no mesmo elemento, descarta um dos dois
 * como conflito. O botão primário perdia a cor do texto e herdava o ink do
 * container: 2.58:1 no Brasa e 1:1 no Grafite — preto sobre preto.
 *
 * Regressão coberta em cn.test.ts. Todo token `text-*` novo entra aqui.
 */
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      'font-size': [
        {
          text: [
            'display-lg',
            'display',
            'title-lg',
            'title',
            'body-lg',
            'body',
            'body-strong',
            'caption',
            'overline',
          ],
        },
      ],
    },
  },
});

/** Junta classes resolvendo conflitos do Tailwind (a última vence). */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
