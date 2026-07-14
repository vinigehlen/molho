/**
 * Servidor estático do Storybook para o teste de contraste.
 * Sem dependência nova: o Playwright sobe isto sozinho (ver playwright.config.ts).
 */
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join } from 'node:path';

// decodeURIComponent: o caminho do repo pode ter espaços, que o URL vira %20.
const RAIZ = decodeURIComponent(new URL('../storybook-static/', import.meta.url).pathname);
const PORTA = 4321;

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const caminho = join(
    RAIZ,
    url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname),
  );

  try {
    const corpo = await readFile(caminho);
    res.writeHead(200, {
      'content-type': TIPOS[extname(caminho)] ?? 'application/octet-stream',
    });
    res.end(corpo);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('não encontrado');
  }
}).listen(PORTA, () => {
  console.log(`storybook estático em http://localhost:${PORTA}`);
});
