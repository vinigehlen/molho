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
 * **HSTS (`Strict-Transport-Security`) é opt-in por `MOLHO_ENABLE_HSTS=true`**:
 * o header tranca o browser em HTTPS pelo `max-age` inteiro, então não pode
 * ligar por acidente antes do TLS de `molho.live` estar validado em produção.
 *
 * **CSP entra em modo report-only**: dá visibilidade antes de bloquear
 * hidratação, analytics ou integrações. Trocar para modo enforce é passo
 * separado depois de observar produção/staging.
 *
 * Mora neste módulo, e não no `main.ts`, pelo mesmo motivo do `configureCors`:
 * `Test.createTestingModule()` não roda o bootstrap.
 */
export const SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy-Report-Only':
    "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; img-src 'self' data: blob: https:; font-src 'self' data: https:; style-src 'self' 'unsafe-inline' https:; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://app.posthog.com https://*.posthog.com https://www.googletagmanager.com https://www.google-analytics.com; connect-src 'self' http://localhost:* https: ws: wss:; media-src 'self' blob: https:; form-action 'self'",
};

export function buildSecurityHeaders(env: NodeJS.ProcessEnv = process.env): Record<string, string> {
  const headers = { ...SECURITY_HEADERS };
  if (env.MOLHO_ENABLE_HSTS === 'true') {
    headers['Strict-Transport-Security'] = 'max-age=15552000; includeSubDomains';
  }
  return headers;
}

export function configureSecurityHeaders(app: INestApplication): void {
  app.use((_req: Request, res: Response, next: NextFunction) => {
    for (const [nome, valor] of Object.entries(buildSecurityHeaders())) {
      res.setHeader(nome, valor);
    }
    next();
  });
}
