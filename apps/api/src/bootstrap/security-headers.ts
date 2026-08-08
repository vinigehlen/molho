import type { INestApplication } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';

/**
 * Headers de resposta constantes, em toda rota.
 *
 * **`X-Content-Type-Options: nosniff`** — impede o browser de adivinhar o tipo
 * de um corpo de resposta. Sem ele, um upload servido com o `Content-Type`
 * errado (ou um erro em texto) pode ser reinterpretado como script e executado
 * na origem da API.
 *
 * **`X-Frame-Options: DENY`** — a API não tem UI; nada aqui deve ser embutido
 * em frame.
 *
 * **`Referrer-Policy`** — não vazar path (que carrega id de pedido/tenant) pra
 * terceiro na navegação de saída.
 *
 * **HSTS (`Strict-Transport-Security`) está DELIBERADAMENTE FORA** até o TLS de
 * `molho.live` estar validado em produção: o header tranca o browser em HTTPS
 * pelo `max-age` inteiro, e ligá-lo antes do certificado confirmado deixa o
 * domínio inacessível por dias, sem como voltar atrás pelo servidor. Entra
 * depois do passe de fumaça de produção (docs/08 §7b), não neste passo.
 *
 * CSP completa também não mora aqui — é item separado de pré-go-live (docs/07).
 *
 * Mora neste módulo, e não no `main.ts`, pelo mesmo motivo do `configureCors`:
 * `Test.createTestingModule()` não roda o bootstrap.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};

export function configureSecurityHeaders(app: INestApplication): void {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    for (const [nome, valor] of Object.entries(SECURITY_HEADERS)) {
      res.setHeader(nome, valor);
    }
    next();
  });
}
