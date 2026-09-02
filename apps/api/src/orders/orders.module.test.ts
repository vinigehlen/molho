import { Test } from '@nestjs/testing';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { OrdersModule } from './orders.module';

/**
 * Só o boot — pega erro de wiring de DI (Épico 16b: LOYALTY_CREDITOR injetado
 * em dois pontos diferentes, MODULE_CACHE, LoyaltyModule importado) que
 * nenhum teste unitário isolado pegaria, porque cada um usa um Fake em vez
 * do provider real do Nest.
 */
describe('OrdersModule', () => {
  beforeAll(() => {
    vi.stubEnv('MOLHO_OTP_HMAC_KEY', 'test-otp-hmac-key');
    vi.stubEnv('MOLHO_JWT_SECRETS', '{"1":"test-jwt-secret"}');
  });

  afterAll(() => {
    vi.unstubAllEnvs();
  });

  it('compila com todos os providers (checkout, status, loyalty) resolvidos', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [OrdersModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
