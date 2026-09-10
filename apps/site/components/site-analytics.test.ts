import { describe, expect, it } from 'vitest';
import { analyticsDestination } from './site-analytics';

describe('analyticsDestination', () => {
  it('remove query e fragmento antes de enviar analytics', () => {
    expect(analyticsDestination('https://app.molho.live/signup?email=pessoa@example.com#plano')).toBe(
      'https://app.molho.live/signup',
    );
  });
});
