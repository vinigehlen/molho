import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { configureSecurityHeaders } from './security-headers';

/**
 * Sobe um app real porque o que se quer provar é que o middleware roda na
 * resposta — um mock de `res.setHeader` provaria só que o objeto literal tem
 * as chaves que ele tem.
 */
@Controller('__ok')
class OkController {
  @Get()
  ok() {
    return { ok: true };
  }
}

let app: INestApplication;

beforeAll(async () => {
  const moduleRef = await Test.createTestingModule({ controllers: [OkController] }).compile();
  app = moduleRef.createNestApplication();
  configureSecurityHeaders(app);
  await app.init();
});

afterAll(async () => {
  await app?.close();
});

describe('configureSecurityHeaders', () => {
  it('marca nosniff, frame-options e referrer-policy na resposta', async () => {
    const res = await request(app.getHttpServer()).get('/__ok').expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  });

  it('NÃO manda HSTS: ligar antes do TLS de molho.live validado tranca o domínio', async () => {
    // Guarda deliberada, não descuido — o header vale pelo max-age inteiro e
    // não tem como voltar atrás pelo servidor. Só entra depois do passe de
    // fumaça de produção (docs/08 §7b); quem adicionar HSTS deve APAGAR este
    // teste conscientemente, não descobrir o efeito em produção.
    const res = await request(app.getHttpServer()).get('/__ok').expect(200);

    expect(res.headers['strict-transport-security']).toBeUndefined();
  });
});
