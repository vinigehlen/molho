import * as Sentry from '@sentry/nextjs';
import { handleCspReport } from '../../../../csp-report';

export async function POST(request: Request): Promise<Response> {
  return handleCspReport(request, (report) => {
    Sentry.captureMessage('csp_violation', { level: 'warning', extra: { ...report } });
  });
}
