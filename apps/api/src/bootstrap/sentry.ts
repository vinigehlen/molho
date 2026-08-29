import * as Sentry from '@sentry/nestjs';

function parseSampleRate(value: string | undefined): number {
  if (!value) {
    return 0;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return 0;
  }

  return Math.min(1, Math.max(0, parsed));
}

export function isSentryEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SENTRY_DSN);
}

export function initSentry(env: NodeJS.ProcessEnv = process.env): void {
  if (!isSentryEnabled(env)) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV ?? 'development',
    release: env.SENTRY_RELEASE,
    tracesSampleRate: parseSampleRate(env.SENTRY_TRACES_SAMPLE_RATE),
  });
}

export function captureException(error: unknown, context: Record<string, unknown> = {}): void {
  if (!isSentryEnabled()) {
    return;
  }

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setContext(key, value as Record<string, unknown>);
    }

    Sentry.captureException(error);
  });
}
