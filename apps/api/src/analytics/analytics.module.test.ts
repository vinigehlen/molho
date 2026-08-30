import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { AnalyticsModule } from './analytics.module';

describe('AnalyticsModule', () => {
  // AnalyticsModule → AuthModule puxa OtpModule e TokenModule, que exigem segredos
  // no boot. Em checkout limpo (CI) não existe .env.local — valores fictícios só
  // pro teste, restaurados no afterAll.
  beforeAll(() => {
    vi.stubEnv('MOLHO_OTP_HMAC_KEY', 'test-otp-hmac-key');
    vi.stubEnv('MOLHO_JWT_SECRETS', '{"1":"test-jwt-secret"}');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('compila com os guards de auth/tenant resolvidos', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AnalyticsModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
