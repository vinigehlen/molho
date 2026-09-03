import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { LoyaltyModule } from './loyalty.module';

describe('LoyaltyModule', () => {
  beforeAll(() => {
    vi.stubEnv('MOLHO_OTP_HMAC_KEY', 'test-otp-hmac-key');
    vi.stubEnv('MOLHO_JWT_SECRETS', '{"1":"test-jwt-secret"}');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('compila com os guards de auth/tenant/módulo resolvidos', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [LoyaltyModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
