import { Controller, Get, type INestApplication, Req } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Request } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureTrustProxy } from './trust-proxy';

/**
 * Este teste sobe um Express DE VERDADE e olha o `request.ip` que ele calcula.
 *
 * Não dá pra testar isto com um mock de request (`{ ip: '1.1.1.1' }`): quem
 * deriva `request.ip` de `X-Forwarded-For` é o Express, a partir do socket e
 * da opção `trust proxy` — os guards e controllers do Molho apenas LEEM a
 * propriedade pronta. Um mock estaria afirmando que `'1.1.1.1' === '1.1.1.1'`
 * e passaria verde com a configuração errada, ou sem configuração nenhuma.
 *
 * Por isso é um teste só, no ponto onde a configuração mora, e não um por
 * guard: todos os consumidores de IP (rate limit de OTP, rate limit do
 * storefront, auditoria de sessão) leem o MESMO valor deste mesmo Express.
 * Testar o comportamento três vezes não aumentaria a cobertura do que pode
 * quebrar — que é a configuração, não a leitura.
 *
 * Sem Postgres e sem Redis: é `.test.ts` normal, roda no `pnpm test`.
 */

@Controller('__ip')
class IpEchoController {
  @Get()
  echo(@Req() req: Request) {
    return { ip: req.ip };
  }
}

async function criaApp(configurado: boolean): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ controllers: [IpEchoController] }).compile();
  const app = moduleRef.createNestApplication();
  if (configurado) configureTrustProxy(app);
  await app.init();
  return app;
}

/** Supertest conecta do loopback; o formato varia (`::1`, `::ffff:127.0.0.1`). */
function ehLoopback(ip: string | undefined): boolean {
  return typeof ip === 'string' && /(^::1$)|(127\.0\.0\.1$)/.test(ip);
}

let appConfigurado: INestApplication;
let appSemConfig: INestApplication;

beforeAll(async () => {
  appConfigurado = await criaApp(true);
  appSemConfig = await criaApp(false);
});

afterAll(async () => {
  await appConfigurado?.close();
  await appSemConfig?.close();
});

describe('configureTrustProxy', () => {
  it('um proxy na frente: X-Forwarded-For vira o IP do cliente', async () => {
    const res = await request(appConfigurado.getHttpServer())
      .get('/__ip')
      .set('X-Forwarded-For', '1.1.1.1')
      .expect(200);

    expect(res.body.ip).toBe('1.1.1.1');
  });

  it('cadeia forjada pelo cliente: confia só no salto que o NOSSO proxy anexou', async () => {
    // O cliente mandou "1.1.1.1, 2.2.2.2" tentando se passar por outro IP; o
    // proxy anexou o IP real (3.3.3.3) à direita. Com hop count 1, o Express
    // conta do socket pra trás e para no último — os forjados são ignorados.
    const res = await request(appConfigurado.getHttpServer())
      .get('/__ip')
      .set('X-Forwarded-For', '1.1.1.1, 2.2.2.2, 3.3.3.3')
      .expect(200);

    expect(res.body.ip).toBe('3.3.3.3');
  });

  it('rate limit não é evadível trocando o header a cada request', async () => {
    // A garantia que sustenta o rate limit por IP: dois requests forjando
    // valores DIFERENTES continuam caindo na mesma chave, porque o que conta é
    // o salto anexado pelo proxy, idêntico nos dois.
    const primeiro = await request(appConfigurado.getHttpServer())
      .get('/__ip')
      .set('X-Forwarded-For', '9.9.9.9, 3.3.3.3')
      .expect(200);
    const segundo = await request(appConfigurado.getHttpServer())
      .get('/__ip')
      .set('X-Forwarded-For', '8.8.8.8, 3.3.3.3')
      .expect(200);

    expect(primeiro.body.ip).toBe('3.3.3.3');
    expect(segundo.body.ip).toBe(primeiro.body.ip);
  });

  it('sem X-Forwarded-For (dev, conexão direta): cai no IP do socket', async () => {
    const res = await request(appConfigurado.getHttpServer()).get('/__ip').expect(200);

    expect(ehLoopback(res.body.ip)).toBe(true);
  });

  it('regressão: SEM a configuração, X-Forwarded-For é ignorado e todo cliente vira o mesmo IP', async () => {
    // Estado anterior ao fix. Se este teste passar a devolver 1.1.1.1, é
    // porque o Express começou a confiar no header por padrão — o que
    // reintroduziria a forja que o hop count explícito fecha.
    const res = await request(appSemConfig.getHttpServer())
      .get('/__ip')
      .set('X-Forwarded-For', '1.1.1.1')
      .expect(200);

    expect(res.body.ip).not.toBe('1.1.1.1');
    expect(ehLoopback(res.body.ip)).toBe(true);
  });
});
