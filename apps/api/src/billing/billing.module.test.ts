import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { BillingModule } from './billing.module';

describe('BillingModule', () => {
  beforeAll(() => {
    vi.stubEnv('MOLHO_OTP_HMAC_KEY', 'test-otp-hmac-key');
    vi.stubEnv('MOLHO_JWT_SECRETS', '{"1":"test-jwt-secret"}');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('compila com os guards de auth/tenant/plataforma resolvidos', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [BillingModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
