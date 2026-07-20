import type { INestApplication } from '@nestjs/common';

/**
 * Quantos proxies existem ENTRE o cliente e esta API. Hoje: um só (a borda da
 * plataforma). É um número, não `true`, de propósito — ver `configureTrustProxy`.
 */
export const TRUSTED_PROXY_HOPS = 1;

/**
 * Ensina o Express a extrair o IP real do cliente de `X-Forwarded-For`.
 *
 * Sem isto, `request.ip` atrás de um proxy é o IP do PROXY: todos os clientes
 * colapsam numa chave só de rate limit (um visitante derruba os outros) e a
 * auditoria de sessão grava o IP errado. Não morde em dev, onde a conexão é
 * direta e `request.ip` já é o IP real — por isso passou despercebido.
 *
 * **Hop count explícito (`1`), nunca `true`.** `true` manda o Express confiar
 * na cadeia INTEIRA de `X-Forwarded-For`, e esse header é escrito pelo
 * cliente: qualquer um manda `X-Forwarded-For: 9.9.9.9`, vira o "IP real" e
 * escapa do rate limit trocando o valor a cada request. Com `1`, o Express
 * conta a partir do socket e para no primeiro salto — ou seja, usa o valor que
 * NOSSO proxy anexou (o IP que de fato abriu a conexão com ele) e descarta
 * tudo que o cliente tentou empilhar antes. Forjar o header vira no-op.
 *
 * O número tem que casar com a topologia real. Se um dia entrar outra camada
 * na frente (ex.: Cloudflare ANTES da plataforma), este valor vira `2` — se
 * ficar em `1`, `request.ip` passa a ser o IP da camada intermediária e o bug
 * volta, silencioso igual à primeira vez.
 *
 * Mora aqui, e não em `main.ts`, porque `Test.createTestingModule()` NÃO
 * executa o bootstrap: se a configuração morasse só no `main.ts`, ela seria
 * impossível de testar e todo app de teste subiria sem ela.
 */
export function configureTrustProxy(app: INestApplication): void {
  app.getHttpAdapter().getInstance().set('trust proxy', TRUSTED_PROXY_HOPS);
}
