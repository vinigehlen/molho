import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';
import { AnalyticsModule } from './analytics.module';

describe('AnalyticsModule', () => {
  it('compila com os guards de auth/tenant resolvidos', async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AnalyticsModule] }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  });
});
