import type { Request } from 'express';

/** Populado por `PrintDeviceAuthGuard`, lido por `PrintDeviceContextInterceptor`. */
export interface RequestWithPrintDevice extends Request {
  printDevice?: { id: string; tenantId: string };
}
