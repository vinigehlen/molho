import { Controller, Get, type INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buildSecurityHeaders, configureSecurityHeaders } from './security-headers';

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
  it('marca nosniff, frame-options, referrer-policy e CSP report-only na resposta', async () => {
    const res = await request(app.getHttpServer()).get('/__ok').expect(200);

    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-frame-options']).toBe('DENY');
    expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
    expect(res.headers['content-security-policy-report-only']).toContain("default-src 'self'");
  });

  it('não manda HSTS por padrão: ligar antes do TLS de molho.live validado tranca o domínio', async () => {
    const res = await request(app.getHttpServer()).get('/__ok').expect(200);

    expect(res.headers['strict-transport-security']).toBeUndefined();
  });

  it('prepara HSTS só quando MOLHO_ENABLE_HSTS=true', () => {
    expect(buildSecurityHeaders({ MOLHO_ENABLE_HSTS: 'false' })['Strict-Transport-Security']).toBeUndefined();
    expect(buildSecurityHeaders({ MOLHO_ENABLE_HSTS: 'true' })['Strict-Transport-Security']).toBe(
      'max-age=15552000; includeSubDomains',
    );
  });
});
