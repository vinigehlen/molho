import * as Sentry from '@sentry/nestjs';
import { describe, expect, it, vi } from 'vitest';
import { initSentry, isSentryEnabled } from './sentry';

vi.mock('@sentry/nestjs', () => ({
  init: vi.fn(),
  withScope: vi.fn(),
  captureException: vi.fn(),
}));

describe('Sentry bootstrap', () => {
  it('fica desligado sem DSN', () => {
    expect(isSentryEnabled({})).toBe(false);

    initSentry({});

    expect(Sentry.init).not.toHaveBeenCalled();
  });

  it('inicializa com ambiente, release e amostragem explícitos', () => {
    initSentry({
      SENTRY_DSN: 'https://example@sentry.io/1',
      SENTRY_ENVIRONMENT: 'staging',
      SENTRY_RELEASE: 'molho@abc123',
      SENTRY_TRACES_SAMPLE_RATE: '0.25',
    });

    expect(Sentry.init).toHaveBeenCalledWith({
      dsn: 'https://example@sentry.io/1',
      environment: 'staging',
      release: 'molho@abc123',
      tracesSampleRate: 0.25,
    });
  });
});
