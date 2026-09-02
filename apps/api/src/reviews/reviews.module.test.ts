import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { ReviewsModule } from './reviews.module';

describe('ReviewsModule', () => {
  beforeAll(() => {
    vi.stubEnv('MOLHO_OTP_HMAC_KEY', 'test-otp-hmac-key');
    vi.stubEnv('MOLHO_JWT_SECRETS', '{"1":"test-jwt-secret"}');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('compila com os guards de auth/tenant resolvidos', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [ReviewsModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
