import { readFileSync } from 'node:fs';
import { type Page, expect, test } from '@playwright/test';
import { THEMES, THEME_KEYS } from '../src/themes';
import { type Amostra, type LimiaresContraste, auditarContraste } from './contrast-audit';

/**
 * Contraste real, medido no pixel — o teste que pega o que unit + axe não pegam.
 *
 * Cobre a matriz COMPONENTE × TEMA × ESTADO. As stories vêm do index.json que o
 * Storybook gera, então todo componente novo entra na matriz sozinho: ninguém
 * precisa lembrar de editar este arquivo.
 */

const LIMIARES: LimiaresContraste = {
  texto: 4.5, // WCAG 1.4.3 AA — texto normal
  textoGrande: 3, // >= 24px, ou >= 18.66px em negrito
  grafico: 3, // WCAG 1.4.11 — borda de campo e ícone com significado
  desabilitado: 4.5, // sim, o mesmo do texto normal — ver abaixo
};

/**
 * Sobre o disabled: a WCAG 1.4.3 ISENTA componentes inativos, e quase todo
 * design system se abriga nessa isenção. Nós não. Exigimos os mesmos 4.5:1 —
 * e é alcançável porque o disabled do Tempero é um par de tokens (fundo cinza
 * + texto ink-600 = 5.8:1), não `opacity: 40%`.
 *
 * A primeira rodada deste teste mediu o disabled com opacidade em 1.31–1.58:1
 * nos quatro temas: era "invisível", não "desabilitado".
 */

interface Story {
  id: string;
  title: string;
  name: string;
}

function carregarStories(): Story[] {
  const caminho = new URL('../storybook-static/index.json', import.meta.url);

  let bruto: string;
  try {
    bruto = readFileSync(caminho, 'utf8');
  } catch {
    throw new Error(
      'storybook-static/index.json não existe. Rode `pnpm --filter @molho/ui build` antes do teste de contraste.',
    );
  }

  const index = JSON.parse(bruto) as {
    entries: Record<string, { id: string; title: string; name: string; type?: string }>;
  };

  const stories = Object.values(index.entries).filter((e) => e.type !== 'docs');

  if (stories.length === 0) {
    throw new Error('Nenhuma story no index.json — o build do Storybook saiu vazio?');
  }

  return stories.map(({ id, title, name }) => ({ id, title, name }));
}

const STORIES = carregarStories();

async function abrir(page: Page, storyId: string, tema: string) {
  await page.goto(`/iframe.html?id=${storyId}&viewMode=story&globals=theme:${tema}`, {
    waitUntil: 'networkidle',
  });
  await page.waitForSelector('#storybook-root', { state: 'attached' });
  // O decorator de tema injeta as CSS vars no primeiro render; sem esta espera a
  // medição pega o frame anterior à troca de tema.
  await page.waitForFunction(() => {
    const raiz = document.querySelector('#storybook-root > *');
    return Boolean(raiz && getComputedStyle(raiz).getPropertyValue('--brand').trim());
  });
}

function reprovadas(amostras: Amostra[]): Amostra[] {
  return amostras.filter((a) => !a.passa);
}

function relatar(amostras: Amostra[], contexto: string): string {
  const linhas = reprovadas(amostras).map(
    (a) =>
      `  ✗ [${a.tipo}] ${a.elemento} ${a.texto ? `"${a.texto}" ` : ''}` +
      `${a.desabilitado ? '(desabilitado) ' : ''}` +
      `${a.frente} sobre ${a.fundo} = ${a.razao}:1 (mínimo ${a.minimo}:1)`,
  );
  return `${contexto}\n${linhas.join('\n')}`;
}

for (const tema of THEME_KEYS) {
  test.describe(`tema ${THEMES[tema].name}`, () => {
    for (const story of STORIES) {
      test(`${story.title} › ${story.name}`, async ({ page }) => {
        await abrir(page, story.id, tema);

        // ── Estado 1: como a story nasce (inclui o disabled das stories que o
        //    exercitam — o auditor detecta [disabled] e aplica o piso próprio).
        const emRepouso = await page.evaluate(auditarContraste, LIMIARES);

        expect(
          reprovadas(emRepouso),
          relatar(emRepouso, `Contraste reprovado em repouso (tema ${tema}, ${story.id})`),
        ).toEqual([]);

        // ── Estado 2: hover em cada elemento interativo habilitado.
        //    O hover escurece a marca em 8% — é onde a cor "quase AA" cai fora.
        const interativos = page.locator(
          '#storybook-root button:not([disabled]), #storybook-root a[href], #storybook-root input:not([disabled])',
        );

        for (let i = 0; i < (await interativos.count()); i++) {
          const alvo = interativos.nth(i);
          await alvo.hover();

          const emHover = await page.evaluate(auditarContraste, LIMIARES);
          const rotulo = (await alvo.textContent())?.trim() || (await alvo.getAttribute('id')) || `#${i}`;

          expect(
            reprovadas(emHover),
            relatar(emHover, `Contraste reprovado em hover sobre "${rotulo}" (tema ${tema}, ${story.id})`),
          ).toEqual([]);
        }
      });
    }
  });
}
